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
context.configure({
	device: device,
	format: cFormat}
);
// tell the canvas's WebGPU context that we will 
// associate the given gpu device, and the given
// screen format with the canvas.
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
// we pass a GPUTextureView as it allows us to specify what parts
// of the texture we will want to render to. Running createView(...)
// with default arguments allows for the entire texture to be used.
// loadOp := what operation to do when the render pass starts.
// storeOp := what operation to do when the render pass ends.
// "clear" :-> clears the screen.
// "store" :-> puts all changes in the pass to the texture.
pass.end(); // ends the render pass.
// remember: we are not actually changing anything right now. We are simply
// appending to a command list that will be encoded, and sent to the gpu
// const commandBuffer = encoder.finish();
// once you want to submit the commands to the device queue:
const dQueue = device.queue;
// dQueue.submit([commandBuffer]); // OR we can do:
dQueue.submit([ encoder.finish() ]);

