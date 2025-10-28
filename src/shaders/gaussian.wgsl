struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) radius: f32
    //TODO: information passed from vertex shader to fragment shader
};

struct VertexInput {
    @location(0) corner: vec2<f32>
}

struct Splat {
    NDCpos: vec4<f32>,
    conic: vec3<f32>,
    radius: f32
};

struct CameraUniforms {
    view: mat4x4<f32>,
    view_inv: mat4x4<f32>,
    proj: mat4x4<f32>,
    proj_inv: mat4x4<f32>,
    viewport: vec2<f32>,
    _pad1: vec2<f32>,
    focal: vec2<f32>,
    _pad2: vec2<f32>
};

struct Gaussian {
    pos_opacity: array<u32,2>,
    rot: array<u32,2>,
    scale: array<u32,2>
}

struct gaussParams{
    gaussian_mult: f32
}

@group(0) @binding(0)
var<uniform> camera: CameraUniforms;

@group(1) @binding(0)
var<storage,read> gaussians : array<Gaussian>;

@group(2) @binding(0)
var<uniform> params: gaussParams;

@group(3) @binding(0)
var<storage, read> splatList : array<Splat>;

@group(3) @binding(1)
var<storage, read> splatIndexList : array<u32>;


@vertex
fn vs_main(in : VertexInput, @builtin(instance_index) instance: u32,
) -> VertexOutput {
    //TODO: reconstruct 2D quad based on information from splat, pass 
    var out: VertexOutput;
    let vertex = gaussians[instance]; 
    let a = unpack2x16float(vertex.pos_opacity[0]);
    let b = unpack2x16float(vertex.pos_opacity[1]);
    let pos = vec4<f32>(a.x, a.y, b.x, 1.);

    let culledIndex = splatIndexList[instance];
    let rad = splatList[culledIndex].radius;

    let clipPos = splatList[culledIndex].NDCpos;// camera.proj * camera.view *  pos; //

    let px2ndc = vec2<f32>(2.0 / camera.viewport.x,
                           2.0 / camera.viewport.y);

    var offset_ndc = rad * in.corner * px2ndc;

    let magic = params.gaussian_mult;

    // let a = unpack2x16float(vertex.scale[0]);
    // offset_ndc.x *= a.x;
    // offset_ndc.y *= a.y;

    //offset_ndc *= 10.0; // IF SCENE HAS NO SCALE ATTRIBUTE

    let ndc_center = clipPos.xy / clipPos.w;
    let new_ndc = ndc_center + offset_ndc;
    let new_xyclip = new_ndc * clipPos.w;    

    out.position = vec4<f32>(new_xyclip, clipPos.z, clipPos.w);
    out.radius = rad;

    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let normalized_radius = clamp(in.radius / 100.0, 0.0, 1.0);
    
    // Create a color gradient based on radius
    var color: vec3<f32>;
    if (in.radius < 20.0) {
        color = vec3<f32>(0.0, 0.0, 1.0);  // Blue for small
    } else if (in.radius < 50.0) {
        color = vec3<f32>(0.0, 1.0, 0.0);  // Green for medium
    } else {
        color = vec3<f32>(1.0, 0.0, 0.0);  // Red for large
    }
    
    // Or use a smooth gradient:
    color = vec3<f32>(normalized_radius, 1.0 - normalized_radius, 0.5);
    
    return vec4<f32>(color, 1.0);
}