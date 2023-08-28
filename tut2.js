const canvas = document.querySelector("canvas");
// gpu is like the handle into the driver
if(!navigator.gpu) {
	throw new Error("WebGPU is not supported");
}
// retreive the adapter from the driver
const adapter = await navigator.gpu.requestAdapter();
// requestDevice() returns a promise, so we'll need
// to wait.
const device = await adapter.requestDevice();
// grab the device. This means the adapter can house
// multiple references for different GPUs.
const context = canvas.getContext("webgpu");
// determine what best storage type for pixels to use
// for the framebuffer that will serve as the canvas 
// image
const cFormat = navigator.gpu.PreferredCanvasFormat();
context.configure({device: device, format: cFormat});
// tell the canvas's WebGPU context that we will 
// associate the given gpu device, and the given
// screen format with the canvas.
const dQueue = device.queue;
// remember: we are not actually changing anything right now. We are simply
// appending to a command list that will be encoded, and sent to the gpu

const vertices = new Float32Array([
	-0.8, -0.8,
	+0.8, -0.8,
	+0.8, +0.8,

	-0.8, -0.8,
	+0.8, +0.8,
	-0.8, +0.8,
]);
// vertex buffer (just like WebGL)
const vBuffer = device.createBuffer({
	label: "Cell vertices", // just a name for handling errors
	size: vertices.byteLength,
	usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
});
// VERTEX: vertex data
// COPY_DST: want to write data into the buffer
dQueue.writeBuffer(vBuffer, /*bufferOffset=*/0, vertices);

// for a list of all gpu vertex formats in WebGPU:
// https://gpuweb.github.io/gpuweb/#enumdef-gpuvertexformat
const vbLayout = {
	arrayStride: 8, // how far to advance (in bytes) for the next attr.
	attributes: [{
		format, "float32x2",
		offset: 0, // where (in bytes) we are inside of the vertex.
		shaderLocation: 0, // where this attribute maps to in WGSL
	}],
};
// vertex-shader module
const vsModule = device.createShaderModule({
	label: "Vertex shader",
	code:`
	@vertex
	fn main(@location(0) pos: vec2f) -> 
	@builtin(position) vec4f {
		return vec4f(pos.xy, 0, 1);
	}`
});
// fragment-shader module
const fsModule = device.createShaderModule({
	label: "Fragment shader",
	code:`
	@fragment
	fn main() -> @location(0) vec4f {
		return vec4f(1, 0, 0, 1);
	}`
});
// creating a render pipeline (what occurs in a draw call)
const rPipeline = device.createRenderPipeline({
	label: "Render pipeline",
	layout: "auto",
	vertex: {
		module: vsModule,
		entryPoint: "main",
		buffers: [vbLayout]
	},
	fragment: {
		module: fsModule,
		entryPoint: "main",
		targets: [{ format: canvasFormat }]
	}
});

const encoder = device.createCommandEncoder();
// we will now begin sending commands to the GPU.
const pass = encoder.beginRenderPass({
	colorAttachments: [{
		view: context.getCurrentTexture().createView(),
		clearValue: [0,0.5,0.7,1],
		loadOp: "clear",
		storeOp: "store",
	}]
});

pass.setPipeline(rPipeline); // what draw call pipeline will we use 
pass.setVertexBuffer(0, vBuffer); // # what data to supply the modules
pass.draw(vertices.length / 2); // # of vertices to draw

// we pass a GPUTextureView as it allows us to specify what parts
// of the texture we will want to render to. Running createView(...)
// with default arguments allows for the entire texture to be used.
// loadOp := what operation to do when the render pass starts.
// storeOp := what operation to do when the render pass ends.
// "clear" :-> clears the screen.
// "store" :-> puts all changes in the pass to the texture.
pass.end(); // ends the render pass.
// const commandBuffer = encoder.finish();
// once you want to submit the commands to the device queue:
// dQueue.submit([commandBuffer]); // OR we can do:
dQueue.submit([ encoder.finish() ]);

