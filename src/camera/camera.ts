import { Mat3, mat3, Mat4, mat4, Vec3, vec3, Vec2, vec2 } from 'wgpu-matrix';
import { log, time, timeLog } from '../utils/simple-console';

interface CameraJson {
  id: number
  img_name: string
  width: number
  height: number
  position: number[]
  rotation: number[][]
  fx: number
  fy: number
};

function focal2fov(focal: number, pixels: number): number {
  return 2 * Math.atan(pixels / (2 * focal));
}

function fov2focal(fov: number, pixels: number): number {
  return pixels / (2 * Math.tan(fov * 0.5));
}

function get_view_matrix(r: Mat4, t: Vec3): Mat4 {
  const minus_t = vec3.mulScalar(t, -1);
  return mat4.translate(r, minus_t);
}


function get_projection_matrix(znear: number, zfar: number, fov_x: number, fov_y: number) {
  // return mat4.perspective(fov_y, 1, znear, zfar);

  const tan_half_fov_y = Math.tan(fov_y / 2.);
  const tan_half_fov_x = Math.tan(fov_x / 2.);

  const top = tan_half_fov_y * znear;
  const bottom = -top;
  const right = tan_half_fov_x * znear;
  const left = -right;

  const p = mat4.create();
  p[0] = 2.0 * znear / (right - left);
  // p[5] = 2.0 * znear / (top - bottom);
  p[5] = -2.0 * znear / (top - bottom);   // flip Y
  p[2] = (right + left) / (right - left);
  p[6] = (top + bottom) / (top - bottom);
  p[14] = 1.;
  p[10] = zfar / (zfar - znear);
  p[11] = -(zfar * znear) / (zfar - znear);
  mat4.transpose(p, p);
  
  // p[0] = 2.0 * znear / (right - left);
  // p[5] = 2.0 * znear / (top - bottom);
  // p[8] = (right + left) / (right - left);
  // p[9] = (top + bottom) / (top - bottom);
  // p[10] = zfar / (zfar - znear);
  // p[11] = -(zfar * znear) / (zfar - znear);
  // p[14] = 1.;
  // mat4.transpose(p, p);
  return p;
}

interface CameraPreset {
  position: Vec3,
  rotation: Mat4,
}

export async function load_camera_presets(file: string): Promise<CameraPreset[]> {
  const blob = new Blob([file]);
  const arrayBuffer = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = function(event) {
      resolve(event.target.result);  // Resolve the promise with the ArrayBuffer
    };

    reader.onerror = reject;  // Reject the promise in case of an error
    reader.readAsArrayBuffer(blob);
  });
  const text = new TextDecoder().decode(arrayBuffer as ArrayBuffer);
  const json = JSON.parse(text);
  log(`loaded cameras count: ${json.length}`);

  return json.map((j: CameraJson): CameraPreset => {
    const position = vec3.clone(j.position);
    // const rotation = mat3.create(...j.rotation.flat());
    const rotation = mat4.fromMat3(mat3.create(...j.rotation.flat()));

    return {
      position,
      rotation,
    };
  });
}


const c_size_vec2 = 4 * 2;
const c_size_mat4 = 4 * 16; // byte size of mat4 (i.e. Float32Array(16))
const c_size_camera_uniform = 4 * c_size_mat4 + 4 * c_size_vec2;
interface CameraUniform {
  view_matrix: Mat4,
  view_inv_matrix: Mat4,
  proj_matrix: Mat4,
  proj_inv_matrix: Mat4,

  viewport: Vec2,
  focal: Vec2,
}

export function create_camera_uniform_buffer(device: GPUDevice) {
  return device.createBuffer({
    label: 'camera uniform',
    size: c_size_camera_uniform,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
}

const intermediate_float_32_array = new Float32Array(c_size_camera_uniform / Float32Array.BYTES_PER_ELEMENT);

export class Camera {
  constructor(
    public readonly canvas: HTMLCanvasElement,
    private readonly device: GPUDevice,
  ) {
    this.uniform_buffer = create_camera_uniform_buffer(device);
    this.on_update_canvas();
  }

  on_update_canvas(): void {
    //const focal = 0.5 * this.canvas.height / Math.tan(this.fovY * 0.5);
    const focal_y = this.canvas.height / (2 * Math.tan(this.fovY * 0.5));
    const focal_x = this.canvas.width / (2 * Math.tan(this.fovX * 0.5));
    this.focal[0] = focal_y;
    this.focal[1] = focal_x;
    this.fovX = focal2fov(focal_y, this.canvas.width);
    this.viewport[0] = this.canvas.width;
    this.viewport[1] = this.canvas.height;
    // const viewport_ratio = this.canvas.width / this.canvas.height;

    this.update_buffer();
  }
  
  readonly uniform_buffer: GPUBuffer;
  
  position = vec3.create();
  rotation = mat4.create();
  private fovY: number = 45 / 180 * Math.PI;
  private fovX: number;
  private focal: Vec2 = vec2.create();
  private viewport: Vec2 = vec2.create();

  private view_matrix: Mat4 = mat4.identity();
  private proj_matrix: Mat4 = mat4.identity();

  look = vec3.create(0, 0, 1);
  up = vec3.create(0, 1, 0);
  right = vec3.create(1, 0, 0);

  update_buffer(): void {
    let offset = 0;

    this.view_matrix = get_view_matrix(this.rotation, this.position);
    this.proj_matrix = get_projection_matrix(0.01, 100, this.fovX, this.fovY);

    const inv_view_matrix = mat4.inverse(this.view_matrix);
    vec3.transformMat4Upper3x3(vec3.create(0, 0, 1), inv_view_matrix, this.look);
    vec3.normalize(this.look, this.look);

    vec3.cross(this.up, this.look, this.right);
    vec3.normalize(this.right, this.right);

    intermediate_float_32_array.set(this.view_matrix, offset);
    offset += 16;
    intermediate_float_32_array.set(inv_view_matrix, offset);
    offset += 16;
    intermediate_float_32_array.set(this.proj_matrix, offset);
    offset += 16;
    intermediate_float_32_array.set(mat4.inverse(this.proj_matrix), offset);
    offset += 16;
    intermediate_float_32_array.set(this.viewport, offset);
    offset += 4;
    intermediate_float_32_array.set(this.focal, offset);
    offset += 4;

    this.device.queue.writeBuffer(this.uniform_buffer, 0, intermediate_float_32_array);
  }
  set_preset(preset: CameraPreset): void {
    vec3.copy(preset.position, this.position);
    mat4.copy(preset.rotation, this.rotation);
    this.update_buffer();
  }

};
