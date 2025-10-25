struct VertexOutput {
    @builtin(position) position: vec4<f32>
    //TODO: information passed from vertex shader to fragment shader
};

struct VertexInput {
    @location(0) corner: vec2<f32>
}

struct Splat {
    //TODO: store information for 2D splat rendering
    NDCpos: vec4<f32>
};

struct CameraUniforms {
    view: mat4x4<f32>,
    view_inv: mat4x4<f32>,
    proj: mat4x4<f32>,
    proj_inv: mat4x4<f32>,
    viewport: vec2<f32>,
    focal: vec2<f32>
};

struct Gaussian {
    pos_opacity: array<u32,2>,
    rot: array<u32,2>,
    scale: array<u32,2>
}

@group(0) @binding(0)
var<uniform> camera: CameraUniforms;

@group(1) @binding(0)
var<storage,read> gaussians : array<Gaussian>;

@group(3) @binding(0)
var<storage, read> splatList : array<Splat>;

@vertex
fn vs_main(in : VertexInput, @builtin(instance_index) instance: u32,
) -> VertexOutput {
    //TODO: reconstruct 2D quad based on information from splat, pass 
    var out: VertexOutput;
    let vertex = gaussians[instance]; 
    let a = unpack2x16float(vertex.pos_opacity[0]);
    let b = unpack2x16float(vertex.pos_opacity[1]);
    let pos = vec4<f32>(a.x, a.y, b.x, 1.);

    let clipPos = splatList[instance].NDCpos;// camera.proj * camera.view *  pos;

    let px2ndc = vec2<f32>(2.0 / camera.viewport.x,
                           2.0 / camera.viewport.y);
    let offset_ndc = in.corner * 12.0 * px2ndc;

    let ndc_center = clipPos.xy / clipPos.w;
    let new_ndc = ndc_center + offset_ndc;
    let new_xyclip = new_ndc * clipPos.w;

    out.position = vec4<f32>(new_xyclip, clipPos.z, clipPos.w);

    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    return vec4<f32>(1.);
}