// taken from MDN documentation
// https://jsfiddle.net/tatumcreative/86fd797g/
const WGPU_PERSPECTIVE=(w=1,h=1)=> {
	const fov = 0.5;
	const aspect = w/h;
	const near = 0.1;
	const far = 100;
	return WGPU_PERSPECTIVE_MATRIX(fov,aspect,near,far);
}

const WGPU_PERSPECTIVE_MATRIX=(fov, aspect, near, far)=> {
	const f = 1 / Math.tan(fov / 2);
	return [
		f/aspect,	0, 						  0, 		0,
		0,			f,						  0,		0,
		0,			0,(near + far)/(near - far),	   -1, /*handedness*/
		0,			0,	2*(near*far/(near-far)),	    0
	];
}

const WGPU_ORTHOGRAPHIC=(s=7,w=1,h=1)=> {
	const aspect = w/h;
	return WGPU_ORTHOGRAPHIC_MATRIX(-s*aspect,+s*aspect,-s,+s,0.1,100);
}

const WGPU_ORTHOGRAPHIC_MATRIX=(left, right, bottom, top, near, far)=> {
// Each of the parameters represents the plane of the bounding box
    var lr = 1 / (left - right);
    var bt = 1 / (bottom - top);
    var nf = 1 / (near - far);
	
    var row4col1 = (left + right) * lr;
    var row4col2 = (top + bottom) * bt;
    var row4col3 = (far + near) * nf;
  
    return [
       -2 * lr,        0,        0, 0,
             0,  -2 * bt,        0, 0,
             0,        0,   2 * nf, 0,
      row4col1, row4col2, row4col3, 1
    ];
}
