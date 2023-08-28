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
// determine what bes: storage type for pixels to use
// for the framebuffer that will serve as the canvas 
// image
const cFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({device: device, format: cFormat});
// tell the canvas's WebGPU context that we will 
// associate the given gpu device, and the given
// screen format with the canvas.
const dQueue = device.queue;
// remember: we are not actually changing anything right now. We are simply
// appending to a command list that will be encoded, and sent to the gpu

const GRID_SIZE = 256;
// uniform buffer
const ugArray = new Float32Array([GRID_SIZE, GRID_SIZE]);
const ugBuffer = device.createBuffer({
	label: "Grid Buffer Uniforms",
	size: ugArray.byteLength,
	usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
});
dQueue.writeBuffer(ugBuffer, 0, ugArray);

const vertices = new Float32Array([
	-1.0, -1.0,
	+1.0, -1.0,
	+1.0, +1.0,

	-1.0, -1.0,
	+1.0, +1.0,
	-1.0, +1.0,
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

// state
const sArray = new Uint32Array(GRID_SIZE*GRID_SIZE);
const sBuffers = [
	device.createBuffer({
		label: "State buffer A",
		size: sArray.byteLength,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	}),
	device.createBuffer({
		label: "State buffer B",
		size: sArray.byteLength,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	})
];

const tArray = new Float32Array(3);
const tBuffer = device.createBuffer({
	label: "Times buffer",
	size: tArray.byteLength,
	usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

for(let i=0;i<sArray.length;i+= 3) {
	sArray[i] = Math.random() > 0.6 ? 1 : 0;
}

dQueue.writeBuffer(sBuffers[0], 0, sArray);

// for a list of all gpu vertex formats in WebGPU:
// https://gpuweb.github.io/gpuweb/#enumdef-gpuvertexformat
const vbLayout = {
	arrayStride: 8, // how far to advance (in bytes) for the next attr.
	attributes: [{
		format: "float32x2",
		offset: 0, // where (in bytes) we are inside of the vertex.
		shaderLocation: 0, // where this attribute maps to in WGSL
	}],
};

// vertex-shader module
const vsModule = device.createShaderModule({
	label: "Vertex shader",
	code:`
	@group(0) @binding(0) var<uniform> grid: vec2f;
	@group(0) @binding(1) var<storage> cell_states: array<u32>;
	@group(0) @binding(3) var<uniform> time: vec3f;
	@group(0) @binding(4) var<uniform> mdl_m: mat4x4f;
	@group(0) @binding(5) var<uniform> prj_m: mat4x4f;

	struct a2v {
		@location(0) pos: vec2f,
		@builtin(instance_index) instance: u32,
	};

	struct v2f {
		@builtin(position) pos: vec4f,
		@location(0) cell: vec2f,
	};

	const pi = 3.14159265359;

	@vertex
	fn vmain(va: a2v) -> v2f {
		let i = f32(va.instance); // cast to float
		let cell = vec2(i % grid.x, floor(i / grid.x));
		let cellOffset = 2*cell / grid;
		let state = f32(cell_states[va.instance]);

		var o: v2f;

		let ct = 0.5 + 0.25*time[1];

		let gp = ((va.pos + 1) / grid) - 1 + cellOffset;
		o.pos = vec4(gp*state, 0, 1);

		o.pos = prj_m*(mdl_m*o.pos);
		o.pos.w *= (4 + 8*(ct) - length(o.pos.xy));

		o.cell = cell;
		return o;
	}`
});

// fragment-shader module
const fsModule = device.createShaderModule({
	label: "Fragment shader",
	code:`
	struct v2f {
		@location(0) cell: vec2f,
	};

	@group(0) @binding(0) var<uniform> grid: vec2f;
	@fragment
	fn fmain(o: v2f) -> @location(0) vec4f {
		let cg = o.cell / grid;
		return vec4f(cg, 1-cg.x, 1);
	}`
});

const bgLayout = device.createBindGroupLayout({
	label: "Cell Bind Group Layout",
// grid
	entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE, buffer: {} },
// cell buffer a
	{ binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage"} }, 
// cell buffer b
	{ binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage"} },
// time buffer
	{ binding: 3, visibility: GPUShaderStage.VERTEX, buffer: {} },
// model
	{ binding: 4, visibility: GPUShaderStage.VERTEX, buffer: {} },
// projection
	{ binding: 5, visibility: GPUShaderStage.VERTEX, buffer: {} }]
});

const mdlArray = new Float32Array(mIdentity4x4());
const mdlBuffer = device.createBuffer({
	label: "Model matrix",
	size: mdlArray.byteLength,
	usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
dQueue.writeBuffer(mdlBuffer, 0, mdlArray);

const pArray = new Float32Array(WGPU_PERSPECTIVE(1000,1000));
const pBuffer = device.createBuffer({
	label: "Projection matrix",
	size: pArray.byteLength,
	usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
dQueue.writeBuffer(pBuffer, 0, pArray);

// creating a bind group to pass uniforms to the pipeline
const bGroups = [device.createBindGroup({
	label: "Bind group A",
	layout: bgLayout,
	entries: [
		{ binding: 0, resource: { buffer: ugBuffer } },		// Grid <v2>
		{ binding: 1, resource: { buffer: sBuffers[0] } },  // Cell A <storage>
		{ binding: 2, resource: { buffer: sBuffers[1] } },	// Cell B <storage>
		{ binding: 3, resource: { buffer: tBuffer } },		// Time <v3>
		{ binding: 4, resource: { buffer: mdlBuffer } },	// model matrix
		{ binding: 5, resource: { buffer:   pBuffer } },	// projection matrix
	]
}),
	device.createBindGroup({
	label: "Bind group B",
	layout: bgLayout,
	entries: [
		{ binding: 0, resource: { buffer: ugBuffer } },		// Grid <v2>
		{ binding: 1, resource: { buffer: sBuffers[1] } },	// Cell A <storage>
		{ binding: 2, resource: { buffer: sBuffers[0] } },	// Cell B <storage>
		{ binding: 3, resource: { buffer: tBuffer } },		// Time <v3>
		{ binding: 4, resource: { buffer: mdlBuffer } },	// model matrix
		{ binding: 5, resource: { buffer:   pBuffer } },	// projection matrix
	]
})];

// think of this as declaring all group layouts associated per group.
// A pipeline layout is a collection of group layouts.
const pLayout = device.createPipelineLayout({
	label: "Cell pipeline layout",
	bindGroupLayouts: [ bgLayout ] // @group(0)
});

// creating a render pipeline (what occurs in a draw call)
// |-> render pipeline is a shader program.
const rPipeline = device.createRenderPipeline({
	label: "Render pipeline",
	layout: pLayout,
	vertex: { module: vsModule, entryPoint: "vmain", buffers: [vbLayout]},
	fragment: { module: fsModule, entryPoint: "fmain", targets: [{ format: cFormat }]}
});

const WORKGROUP_SIZE = 8;
const simModule = device.createShaderModule({
	label: "Sim module",
	code:`
	@group(0) @binding(0) var<uniform> grid: vec2f;
	@group(0) @binding(1) var<storage> cell_sin: array<u32>;
	@group(0) @binding(2) var<storage, read_write> cell_sout: array<u32>;

	fn flat(cx: u32, cy:u32) -> u32 {
		let gx = u32(grid.x);
		let gy = u32(grid.y);
		return (cy % gy)*u32(grid.x) + (cx % gx);
	}
	
	fn cell_active(x: u32, y: u32) -> u32 {
		return cell_sin[flat(x,y)];
	}

	@compute @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE})
	fn cmain(@builtin(global_invocation_id) cell: vec3u) {
		let i = flat(cell.x, cell.y);
		
		let cx = cell.x;
		let cy = cell.y;	

		let adj = cell_active(cx+1, cy+1) +
				  cell_active(cx+1, cy)   +
				  cell_active(cx+1, cy-1) +
				  cell_active(cx,   cy-1) + 
				  cell_active(cx-1, cy-1) +
				  cell_active(cx-1, cy)   +
				  cell_active(cx-1, cy+1) +
				  cell_active(cx,   cy+1
		);
	
		switch adj {
			case 2: {
				cell_sout[i] = cell_sin[i];
			}
			case 3: {
				cell_sout[i] = 1;
			}
			default: {
				cell_sout[i] = 0;
			}
		}
	}`
});

const simPipeline = device.createComputePipeline({
	label: "Simulation pipeline",
	layout: pLayout,
	compute: {
		module: simModule,
		entryPoint: "cmain",
	}
});

const start = Date.now();
const millis = () => {
	const cur = Date.now();
	return (cur - start);
}

let locked = false;
let mouse = [0,0];

const mousePos = (evt) => {
	const rect = canvas.getBoundingClientRect();
	if(locked) {
		mouse[0] += evt.movementX;
		mouse[1] += evt.movementY;

		mouse[0] = Math.max(Math.min(mouse[0], width), 0);
		mouse[1] = Math.max(Math.min(mouse[1], height), 0);

		return mouse;
	}

	return mouse;
}


canvas.addEventListener("mousemove", (evt)=> {
	mouse = mousePos(evt);
}, false);

canvas.addEventListener("click", () => {
	canvas.requestPointerLock = canvas.requestPointerLock || 
		canvas.mozRequestPointerLock || 
		canvas.webkitRequestPointerLock;
	canvas.requestPointerLock();
}, false);
        
document.addEventListener("pointerlockchange", ()=> {
	if(document.pointerLockElement === canvas || 
	   document.mozPointerLockElement === canvas || 
	   document.webkitPointerLockElement === canvas) {
		locked = true;
	}else {
		locked = false;
	}
}, false);

const width = canvas.width;
const height = canvas.height;

let step = 0;

let spinor = mTranslate4x4(0,0,-1);
let spinor_f32 = new Float32Array(spinor.length);

let lastT = 0;
let curT = 0;
let dt = 0;
function updateGrid() {
	const encoder = device.createCommandEncoder();
	
	const computePass = encoder.beginComputePass();

	computePass.setPipeline(simPipeline);
	computePass.setBindGroup(0, bGroups[step % 2]);

	const workgroups = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
	computePass.dispatchWorkgroups(workgroups, workgroups);

	computePass.end();
	step++;
	
// we will now begin sending commands to the GPU.
	const pass = encoder.beginRenderPass({
		colorAttachments: [{
			view: context.getCurrentTexture().createView(),
			clearValue: [0,0,0,1],
			loadOp: "clear",
			storeOp: "store",
		}]
	});

	let tx = (mouse[0] - 0.5) / (4*width);
	let ty = (0.5 - mouse[1]) / (4*height);

	tArray[0] = millis() / 1000;
	tArray[1] = Math.cos(tArray[0]);
	tArray[2] = Math.sin(tArray[0]);

	lastT = curT;
	curT = tArray[0];
	dt = curT - lastT;
	dQueue.writeBuffer(tBuffer, 0, tArray);

	spinor = mMultiply4x4(spinor, mRotz4x4(dt/16));

	let spinor_c = mMultiply4x4(mRoty4x4(tx),spinor);
	spinor_c = mMultiply4x4(mRotx4x4(-ty), spinor_c);

	for(let i=0;i<16;i++) spinor_f32[i] = spinor_c[i];

	dQueue.writeBuffer(mdlBuffer, 0, spinor_f32);

	pass.setPipeline(rPipeline); 						 // what draw call pipeline will we use 
	pass.setVertexBuffer(0, vBuffer); 					 // # what data to supply the modules
	pass.setBindGroup(0, bGroups[step % 2]);
	pass.draw(vertices.length / 2, GRID_SIZE*GRID_SIZE); // # of vertices to draw

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
}
const UPDATE_INTERVAL = 16;
setInterval(updateGrid, UPDATE_INTERVAL);
