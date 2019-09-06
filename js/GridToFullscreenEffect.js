/**
 * A grid items to fullscreen transition
 * @module GridToFullscreenEffect
 * @author Daniel Velasquez
 * @version 1.0.0
 */

class GridToFullscreenEffect {
  /**
    Initializes instance variables. 
    @param {HTMLDivElement} container - Container of the webGL canvas.
    @param {HTMLDivElement} itemsWrapper - Container of the grid items.
    @param {object} options - A configuration object. 
   */
  constructor(container, itemsWrapper, options = {}) {
    this.container = container;
    this.itemsWrapper = itemsWrapper;

    this.initialised = false;
    this.camera = null;
    this.scene = null;
    this.renderer = null;
    this.raycaster = new THREE.Raycaster();

    options.scrollContainer = options.scrollContainer || null;

    // Effect options
    options.duration = options.duration || 1;

    // Vertex options
    options.timing = options.timing || {};
    options.timing.type = options.timing.type || "sameEnd";
    options.timing.props = options.timing.props || {};

    options.transformation = options.transformation || {};
    options.transformation.type = options.transformation.type || "none";
    options.transformation.props = options.transformation.props || {};

    options.activation = options.activation || {};
    options.activation.type = options.activation.type || "corners";
    options.activation.props = options.activation.props || { topLeft: true };

    options.seed = options.seed || 0;
    // "itemUnique" | "InOutUnique" | "tweenUnique"
    options.randomizeSeed = options.randomizeSeed || null;

    options.easings = options.easings || {};
    options.easings.toFullscreen =
      options.easings.toFullscreen || Power0.easeNone;
    if (typeof options.easings.toFullscreen == "string") {
      options.easings.toFullscreen = getEaseFromString(
        options.easings.toFullscreen
      );
    }
    options.easings.toGrid = options.easings.toGrid || Power0.easeNone;
    if (typeof options.easings.toGrid == "string") {
      options.easings.toGrid = getEaseFromString(options.easings.toGrid);
    }
    options.debug = options.debug || {};
    options.debug.activation = options.debug.activation || false;

    this.uniforms = {
      uImage: new THREE.Uniform(null),
      uImageRes: new THREE.Uniform(new THREE.Vector2(1, 1)),
      uImageLarge: new THREE.Uniform(null),
      uImageLargeRes: new THREE.Uniform(new THREE.Vector2(1, 1)),

      // Calculated Uniforms
      uProgress: new THREE.Uniform(0),
      uMeshScale: new THREE.Uniform(new THREE.Vector2(1, 1)),
      uPlaneCenter: new THREE.Uniform(new THREE.Vector2(0, 0)),
      uViewSize: new THREE.Uniform(new THREE.Vector2(1, 1)),
      uScaleToViewSize: new THREE.Uniform(new THREE.Vector2(1, 1)),
      uClosestCorner: new THREE.Uniform(0),
      uMouse: new THREE.Uniform(new THREE.Vector2(0, 0)),

      // Option Uniforms
      uSeed: new THREE.Uniform(0),

      // Debug Uniforms
      uDebugActivation: new THREE.Uniform(false)
    };
    this.options = null;
    this.setOptions(options, true);

    this.textures = [];

    this.currentImageIndex = -1;
    this.isFullscreen = false;
    this.isAnimating = false;

    this.onResize = this.onResize.bind(this);
    this.reset = this.reset.bind(this);
  }
  setOptions(partialOptions = {}, override) {
    let options = this.options;

    if (override) {
      options = partialOptions;
      this.options = options;
      if (this.initialised) {
        this.reset();
      }
      return;
    }
    options.scrollContainer = partialOptions.scrollContainer || null;

    // Effect options
    options.duration = partialOptions.duration || 1;

    // Vertex options
    options.timing = Object.assign({}, partialOptions.timing);
    if (partialOptions.timing) {
      options.timing.type = partialOptions.timing.type || "sameEnd";
      options.timing.props = Object.assign({}, partialOptions.timing.props);
    } else {
      options.timing.type = "sameEnd";
      options.timing.props = {};
    }

    options.transformation = Object.assign({}, partialOptions.transformation);
    if (partialOptions.transformation) {
      options.transformation.type =
        partialOptions.transformation.type || "none";
      options.transformation.props = Object.assign(
        {},
        partialOptions.transformation.props
      );
    } else {
      options.transformation.type = "none";
      options.transformation.props = {};
    }

    options.activation = Object.assign({}, partialOptions.activation);
    if (partialOptions.activation) {
      options.activation.type = partialOptions.activation.type || "corners";
      options.activation.props = Object.assign(
        {},
        partialOptions.activation.props
      );
      if (
        options.activation.type === "corners" &&
        Object.keys(options.activation.props).length === 0
      ) {
        options.activation.props.topLeft = true;
      }
    } else {
      options.activation.type = "corners";
      options.activation.props = { topLeft: true };
    }
    options.seed = partialOptions.seed || 0;
    // "itemUnique" | "InOutUnique" | "tweenUnique"
    options.randomizeSeed = partialOptions.randomizeSeed || null;

    options.easings = {};
    if (partialOptions.easings) {
      options.easings.toFullscreen =
        partialOptions.easings.toFullscreen || Power0.easeNone;
      if (typeof partialOptions.easings.toFullscreen == "string") {
        options.easings.toFullscreen = getEaseFromString(
          partialOptions.easings.toFullscreen
        );
      }
      options.easings.toGrid = partialOptions.easings.toGrid || Power0.easeNone;
      if (typeof partialOptions.easings.toGrid == "string") {
        options.easings.toGrid = getEaseFromString(
          partialOptions.easings.toGrid
        );
      }
    } else {
      options.easings.toFullscreen = Power0.easeNone;
      options.easings.toGrid = Power0.easeNone;
    }

    options.debug = {};
    if (partialOptions.debug) {
      options.debug.activation = partialOptions.debug.activation || false;
    } else {
      options.debug.activation = false;
    }

    this.uniforms.uSeed.value = options.seed;
    this.uniforms.uDebugActivation.value = options.debug.activation;

    this.options = options;
    if (this.initialised) {
      this.reset();
    }
  }
  /**
    An image 
    @typedef {Object} ImageObject
    @property {HTMLImageElement} element - Html element of image
    @property {Image} image - Image object

    An set of small and large image
    @typedef {Object} ImageSet
    @property {ImageObject} small - Small image element
    @property {ImageObject} small - Large image element
  
   */
  /**
    Creates the textures for the plane and sets them if needed.
    @param {imageSet[]} images - Small and large images of grid items.
   */
  createTextures(images) {
    const textures = [];
    for (let i = 0; i < images.length; i++) {
      const imageSet = images[i];
      const largeTexture = new THREE.Texture(imageSet.large.image);

      // So It doesnt get resized to the power of 2
      largeTexture.generateMipmaps = false;
      largeTexture.wrapS = largeTexture.wrapT = THREE.ClampToEdgeWrapping;
      largeTexture.minFilter = THREE.LinearFilter;
      largeTexture.needsUpdate = true;
      const smallTexture = new THREE.Texture(imageSet.small.image);
      smallTexture.generateMipmaps = false;
      smallTexture.wrapS = smallTexture.wrapT = THREE.ClampToEdgeWrapping;
      smallTexture.minFilter = THREE.LinearFilter;
      smallTexture.needsUpdate = true;
      const textureSet = {
        large: {
          element: imageSet.large.element,
          texture: largeTexture
        },
        small: {
          element: imageSet.small.element,
          texture: smallTexture
        }
      };

      textures.push(textureSet);
    }
    this.textures = textures;
    this.setCurrentTextures();
  }
  /**
    Sets the correct textures to the uniforms. And renders if not in a loop
   */
  setCurrentTextures() {
    if (this.currentImageIndex === -1) return;
    const textureSet = this.textures[this.currentImageIndex];
    if (!textureSet) return;
    this.uniforms.uImage.value = textureSet.small.texture;
    this.uniforms.uImageRes.value.x =
      textureSet.small.texture.image.naturalWidth;
    this.uniforms.uImageRes.value.y =
      textureSet.small.texture.image.naturalHeight;
    this.uniforms.uImageLarge.value = textureSet.large.texture;
    this.uniforms.uImageLargeRes.value.x =
      textureSet.large.texture.image.naturalWidth;
    this.uniforms.uImageLargeRes.value.y =
      textureSet.large.texture.image.naturalHeight;
    if (!this.isAnimating) {
      this.render();
    }
  }
  /**
    Initiates THREEJS objects and adds listeners to the items
   */
  init() {
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      10000
    );
    this.camera.position.z = 50;
    this.camera.lookAt = this.scene.position;

    const viewSize = this.getViewSize();
    this.uniforms.uViewSize.value = new THREE.Vector2(
      viewSize.width,
      viewSize.height
    );

    const segments = 128;
    var geometry = new THREE.PlaneBufferGeometry(1, 1, segments, segments);

    const shaders = this.getShaders();
    var material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: shaders.vertex,
      fragmentShader: shaders.fragment,
      side: THREE.DoubleSide
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.mesh);

    window.addEventListener("resize", this.onResize);
    if (this.options.scrollContainer) {
      this.options.scrollContainer.addEventListener("scroll", ev => {
        this.recalculateUniforms(ev);
        this.render();
      });
    }

    for (let i = 0; i < this.itemsWrapper.children.length; i++) {
      const image = this.itemsWrapper.children[i].children[0];
      image.addEventListener("mousedown", this.createOnMouseDown(i));
    }
    this.initialised = true;
  }
  reset() {
    const shaders = this.getShaders();

    this.mesh.material.vertexShader = shaders.vertex;
    this.mesh.material.fragmentShader = shaders.fragment;
    this.mesh.material.needsUpdate = true;

    const uniforms = this.uniforms;
    const options = this.options;

    this.render();
  }
  getShaders() {
    const shaderInfo = {
      transform: this.options.transformation,
      activation: this.options.activation,
      timing: this.options.timing
    };

    const transformOptions = this.options.transformation;
    let transformation = "";
    if (isFunction(transformOptions.type)) {
      transformation = transformOptions.type(shaderInfo);
    } else if (transformOptions.type != null) {
      transformation = transformations[transformOptions.type](
        transformOptions.props,
        shaderInfo
      );
    }
    const activationOptions = this.options.activation;
    let activation = "";
    if (isFunction(activationOptions.type)) {
      activation = activationOptions.type(shaderInfo);
    } else if (activationOptions.type != null) {
      activation = activations[activationOptions.type](
        activationOptions.props,
        shaderInfo
      );
    }

    const timingOptions = this.options.timing;
    let timing = "";
    if (isFunction(timing.type)) {
      timing = timingOptions.type();
    } else if (timingOptions.type != null) {
      timing = timings[timingOptions.type](timingOptions.props, shaderInfo);
    }

    const vertex = this.createVertexShader({
      activation,
      transformation,
      timing
    });
    const fragment = this.createFragmentShader();
    return {
      fragment,
      vertex
    };
  }
  /**
    Creates a listener that sends item to fullscreen when activated. 
    @return {function} Event listener
   */
  createOnMouseDown(itemIndex) {
    return ev => {
      this.currentImageIndex = itemIndex;
      if (this.options.randomizeSeed === "itemUnique") {
        this.uniforms.uSeed.value = itemIndex * 1000;
      }
      if (this.options.onItemClick) this.options.onItemClick(itemIndex);
      this.recalculateUniforms(ev);
      // this.setTextures();
      this.setCurrentTextures();
      this.toFullscreen();
    };
  }
  /*
    Tweens the plane to grid position if on fullscreen 
  */
  toGrid() {
    if (!this.isFullscreen || this.isAnimating) return;

    this.isAnimating = true;
    if (this.options.onToGridStart)
      this.options.onToGridStart({ index: this.currentImageIndex });

    if (
      this.options.randomizeSeed === "InOutUnique" ||
      this.options.randomizeSeed === "tweenUnique"
    ) {
      this.uniforms.uSeed.value = Math.floor(Math.random() * 10000);
    }
    this.tween = TweenLite.to(this.uniforms.uProgress, this.options.duration, {
      value: 0,
      ease: this.options.easings.toGrid,
      onUpdate: () => {
        if (this.options.onProgressTween)
          this.options.onProgressTween(this.uniforms.uProgress.value);

        this.render();
      },
      onComplete: () => {
        this.isAnimating = false;
        this.isFullscreen = false;
        this.tween = null;
        this.itemsWrapper.style.zIndex = 0;
        this.container.style.zIndex = 0;
        this.render();
        if (this.options.onToGridFinish)
          this.options.onToGridFinish({
            index: -1,
            lastIndex: this.currentImageIndex
          });
        // this.currentImageIndex = -1;
      }
    });
  }
  calculateMouse(ev) {
    const rect = this.itemsWrapper.children[
      this.currentImageIndex
    ].children[0].getBoundingClientRect();
    const mouseNormalized = {
      x: (ev.clientX - rect.left) / rect.width,
      // Allways invert Y coord
      y: 1 - (ev.clientY - rect.top) / rect.height
    };

    this.uniforms.uMouse.value = new THREE.Vector2(
      mouseNormalized.x,
      mouseNormalized.y
    );
  }
  recalculateUniforms(ev) {
    if (this.currentImageIndex === -1) return;

    const rect = this.itemsWrapper.children[
      this.currentImageIndex
    ].children[0].getBoundingClientRect();
    const mouseNormalized = {
      x: (ev.clientX - rect.left) / rect.width,
      // Allways invert Y coord
      y: 1 - (ev.clientY - rect.top) / rect.height
    };

    const xIndex = rect.left > window.innerWidth - (rect.left + rect.width);
    const yIndex = rect.top > window.innerHeight - (rect.top + rect.height);

    const closestCorner = xIndex * 2 + yIndex;
    this.uniforms.uClosestCorner.value = closestCorner;
    this.uniforms.uMouse.value = new THREE.Vector2(
      mouseNormalized.x,
      mouseNormalized.y
    );

    const viewSize = this.getViewSize();
    const widthViewUnit = (rect.width * viewSize.width) / window.innerWidth;
    const heightViewUnit = (rect.height * viewSize.height) / window.innerHeight;
    // x and y are based on top left of screen. While ThreeJs is on the center
    const xViewUnit =
      (rect.left * viewSize.width) / window.innerWidth - viewSize.width / 2;
    const yViewUnit =
      (rect.top * viewSize.height) / window.innerHeight - viewSize.height / 2;

    const geometry = this.mesh.geometry;
    const mesh = this.mesh;

    // // The plain's size is initially 1. So the scale is the new size

    mesh.scale.x = widthViewUnit;
    mesh.scale.y = heightViewUnit;

    // // Move the object by its top left corners, not the center
    let x = xViewUnit + widthViewUnit / 2;
    let y = -yViewUnit - heightViewUnit / 2;

    // geometry.translate(x, y, 0);
    mesh.position.x = x;
    mesh.position.y = y;

    // Used to scale the plane from the center
    // divided by scale so when later scaled it looks fine
    this.uniforms.uPlaneCenter.value.x = x / widthViewUnit;
    this.uniforms.uPlaneCenter.value.y = y / heightViewUnit;

    this.uniforms.uMeshScale.value.x = widthViewUnit;
    this.uniforms.uMeshScale.value.y = heightViewUnit;

    this.uniforms.uScaleToViewSize.value.x = viewSize.width / widthViewUnit - 1;
    this.uniforms.uScaleToViewSize.value.y =
      viewSize.height / heightViewUnit - 1;
  }
  forceInitializePlane(index = 0) {
    this.currentImageIndex = index;
    this.recalculateUniforms({
      clientX: window.innerWidth / 2,
      clientY: window.innerHeight
    });
    this.setCurrentTextures();
  }
  toFullscreen() {
    if (this.isFullscreen || this.isAnimating) return;

    this.isAnimating = true;

    this.itemsWrapper.style.zIndex = 0;
    this.container.style.zIndex = 2;

    if (this.options.onToFullscreenStart)
      this.options.onToFullscreenStart({ index: this.currentImageIndex });

    if (this.options.randomizeSeed === "tweenUnique") {
      this.uniforms.uSeed.value = Math.floor(Math.random() * 10000);
    }
    this.tween = TweenLite.to(this.uniforms.uProgress, this.options.duration, {
      value: 1,
      ease: this.options.easings.toFullscreen,
      onUpdate: () => {
        if (this.options.onProgressTween)
          this.options.onProgressTween(this.uniforms.uProgress.value);
        this.render();
      },
      onComplete: () => {
        this.isAnimating = false;
        this.isFullscreen = true;
        this.tween = null;
        if (this.options.onToFullscreenFinish)
          this.options.onToFullscreenFinish({
            index: this.currentImageIndex
          });
      }
    });
  }
  /**
    Gives the width and height of the current camera's view.
    @typedef {Object} Size
    @property {number} width
    @property {number} height

    @return {Size} The size of the camera's view

   */
  getViewSize() {
    const fovInRadians = (this.camera.fov * Math.PI) / 180;
    const height = Math.abs(
      this.camera.position.z * Math.tan(fovInRadians / 2) * 2
    );

    return { width: height * this.camera.aspect, height };
  }
  /**
    Renders ThreeJS to the canvas.
  */
  render() {
    this.renderer.render(this.scene, this.camera);
  }
  /**
    Resize Event Listener.
    Updates anything that uses the window's size.
    @param {Event} ev resize event 
   */
  onResize(ev) {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    if (this.currentImageIndex > -1) {
      this.recalculateUniforms(ev);
      this.render();
    }
  }
  createVertexShader({ activation, transformation, timing }) {
    return `
    ${vertexUniforms}
    ${cubicBeizer}
    ${simplex}

    ${quadraticBezier}
    

    ${activation}
float linearStep(float edge0, float edge1, float val) {
	float x = clamp( (val  - edge0) / (edge1 - edge0),0.,1.);
		return x;
}

mat2 rotate2d(float _angle){
    return mat2(cos(_angle),-sin(_angle),
                sin(_angle),cos(_angle));
}
    void main(){

      vec3 pos = position.xyz;
      vec2 newUV = uv;

      float activation = getActivation(uv);

      float vertexProgress = uProgress;

      ${timing}

        vec3 transformedPos = pos;
        vec2 transformedUV = uv;
        ${transformation}
        pos = transformedPos;
        newUV = transformedUV; 

        // Scale
        // uScaleToViewSize
        scale = vec2(
          1. + uScaleToViewSize * vertexProgress
        );
        // Since we are moving the mesh not the geometry the geometry is in the center
        


        
        pos.xy *= scale;


        // Move to center
        // Mesh moves it into position. Shader moves it to the center
        pos.y += -uPlaneCenter.y * vertexProgress;
        pos.x += -uPlaneCenter.x * vertexProgress;

        // Move slightly to the front
        pos.z += vertexProgress;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos,1.);
        vProgress = vertexProgress;
        vActivation = activation;
      vUv = newUV;
    }
`;
  }
  createFragmentShader() {
    return `
    uniform float uProgress;
    uniform sampler2D uImage;
    uniform vec2 uImageRes;
    uniform sampler2D uImageLarge;
    uniform vec2 uImageLargeRes;
    uniform vec2 uMeshScale;
    uniform bool uDebugActivation;
    
    varying vec2 vUv;
    varying float vProgress;
    varying vec2 scale;
    varying float vActivation;

    vec2 preserveAspectRatioSlice(vec2 uv, vec2 planeSize, vec2 imageSize ){
      
        vec2 ratio = vec2(
            min((planeSize.x / planeSize.y) / (imageSize.x / imageSize.y), 1.0),
            min((planeSize.y / planeSize.x) / (imageSize.y / imageSize.x), 1.0)
        );
        
        
        vec2 sliceUvs = vec2(
            uv.x * ratio.x + (1.0 - ratio.x) * 0.5,
            uv.y * ratio.y + (1.0 - ratio.y) * 0.5
        );

        return sliceUvs;
    }

    void main(){
 
        vec2 uv = vUv;

        vec2 scaledPlane = uMeshScale * scale;

        
        vec2 smallImageUV = preserveAspectRatioSlice(uv, scaledPlane, uImageRes);

        vec3 color = texture2D(uImage,smallImageUV).xyz;

        if(vProgress > 0.){
          vec2 largeImageUV = preserveAspectRatioSlice(uv, scaledPlane, uImageLargeRes);
          color = mix(color,texture2D(uImageLarge,largeImageUV).xyz, vProgress );
        }
        if(uDebugActivation){
          color = vec3(vActivation);
        }

        gl_FragColor = vec4(color,1.);
    }
`;
  }
}
function getEaseFromString(easeString) {
  const dotIndex = easeString.indexOf(".");
  const name = easeString.substring(0, dotIndex);
  const type = easeString.substring(dotIndex + 1);
  const easingTypes = window.com.greensock.easing[name];
  if (!easingTypes) return Power0.easeNone;
  const ease = easingTypes[type];
  if (!ease) return easingTypes["easeIn"];
  return ease;
}
function isFunction(functionToCheck) {
  return (
    functionToCheck && {}.toString.call(functionToCheck) === "[object Function]"
  );
}
const timings = {
  none: options => {
    return ``;
  },
  sameEnd: options => {
    const latestStart = ensureFloat(options.latestStart || 0.5);
    const syncStart = options.reverse;
    let sync = "vertexProgress = smoothstep(startAt,1.,uProgress)";
    if (syncStart) {
      sync = "vertexProgress = smoothstep(0., 1.- startAt, uProgress)";
    }
    return `
      float startAt = activation * ${latestStart};
      ${sync};
    `;
  },
  sections: options => {
    const sections = ensureFloat(options.sections || 1);

    return ` 
        // Vertex end by parts
        float activationPart = 1./${sections};
        float activationPartDuration = 1./(${sections}+1.);

        float progressStart = (activation / activationPart) * activationPartDuration;
        float progressEnd = min(progressStart + activationPartDuration,1.);
        vertexProgress = linearStep(progressStart,progressEnd,uProgress);
      `;
  }
};
var activations = {
  none: () => "float getActivation(vec2 uv){return 0.;}",
  side: options => {
    let res = [];
    let x = [];
    let y = [];
    if (options.top) y.push("(1.-uv.y)");
    if (options.bottom) y.push("uv.y");
    if (options.left) x.push("uv.x");
    if (options.right) x.push("(1.-uv.x)");

    let xFormula = x.join("*2.*");
    if (x.length > 1) {
      xFormula += "*2.";
    }
    if (xFormula.length > 0) res = res.concat(`(${xFormula})`);

    let yFormula = y.join("*2.*");
    if (y.length > 1) {
      yFormula += "*2.";
    }
    if (yFormula.length > 0) res = res.concat(`(${yFormula})`);

    if (res.length === 0) {
      res.push("0.");
    }

    return `
    float getActivation(vec2 uv){
      return ${res.join("*")};
    }
    `;
  },
  corners: options => {
    let res = [];
    let uphill = [];
    let downhill = [];
    if (options.topLeft) downhill.push("(uv.x + 1.- uv.y)");
    if (options.bottomRight) downhill.push("(1.-uv.x + uv.y)");
    if (options.bottomLeft) uphill.push("(uv.x + uv.y)");
    if (options.topRight) uphill.push("(1.-uv.x + 1.- uv.y)");

    if (uphill.length > 0) {
      let formula = uphill[0] + "/2.";
      if (uphill.length > 1) {
        formula = uphill.join("*");
      }
      res.push(formula);
    }
    if (downhill.length > 0) {
      let formula = downhill[0] + "/2.";
      if (downhill.length > 1) {
        formula = downhill.join("*");
      }
      res.push(formula);
    }

    if (res.length === 0) {
      res.push("0.");
    }

    return `
    float getActivation(vec2 uv){
      return ${res.join("*")};
      }
    `;

    return `
    float getActivation(vec2 uv){
      float top = (1.-uv.y);
      float right = uv.x;
      float bottom = uv.y;
      float left = 1.- uv.x;

      return top *0.333333 + (right * 0.333333 + (right * bottom)*0.666666 );
  }
  `;
  },
  radial: options => {
    let x = ensureFloat(options.x || 0.5);
    let y = ensureFloat(options.y || 0.5);
    if (options.onMouse) {
      x = "uMouse.x";
      y = "uMouse.y";
    }
    return `
      float getActivation(vec2 uv){
        vec2 point = vec2(${x},${y});
        float maxDistance = distance(point, 1.-floor(point+0.5));
        float dist = smoothstep(0.,maxDistance,distance(point,uv));
        return dist;
      }
    `;
  },
  closestCorner: () => `
      float getActivation(vec2 uv){

        float y = mod(uClosestCorner,2.) *2. -1.;
        float x = (floor(uClosestCorner /2.)*2.-1.)*-1.;

        float xAct = abs(min(0.,x)) + uv.x * x;
        float yAct = abs(min(0.,y)) + uv.y * y;

        return (xAct+yAct)/2.;
      }
    `,
  closestSide: () => `
      float getActivation(vec2 uv){

        float y = mod(uClosestCorner,2.) *2. -1.;
        float x = (floor(uClosestCorner /2.)*2.-1.)*-1.;

        float xAct = abs(min(0.,x)) + uv.x * x;
        float yAct = abs(min(0.,y)) + uv.y * y;

        return (xAct+yAct)/2.;
      }
    `,
  snake: options => {
    const size = options.rows || 10;
    const sectionSize = ensureFloat(1 / size);

    return `
        float getActivation(vec2 uv){
          float index = min(floor(uv.y / ${sectionSize}), ${ensureFloat(
      size - 1
    )});
          // 0 right or 1 left
          float direction = mod(index, 2.);
          // -1 left and 1 right
          float sign = -(direction * 2. -1.);

          // alternate 1. - uv.x and uv.x
          float xDirection = (direction + uv.x * sign); 
          
          float y = mod(uv.y, ${sectionSize}) / ${sectionSize};
          y = (direction + y * sign) ;
          float yDirection = (xDirection + y);

          // float yDirection = (y * 0.5 + xDirection * 0.5);
          return  ( xDirection * ${sectionSize} + index *${sectionSize});
        }
      `;
  },
  squares: options => {
    const size = options.size || 4;
    const indexSection = ensureFloat(1 / size);

    // There are more colors than rows/columns.
    const nColors = ensureFloat((size - 1) * 2);
    const colorSection = ensureFloat(1 / nColors);
    return `
      float getActivation(vec2 uv){

        float xIndex = floor(uv.x / ${indexSection});
        float yIndex = floor(uv.y / ${indexSection});

        return xIndex * ${colorSection} + ${colorSection} * yIndex;
      }
    `;
  },
  sin: options => {
    let formulas = [];
    if (options.x) {
      let freqX = ensureFloat(options.frequencyX || 2);
      let piOffsetX = ensureFloat(options.piOffsetX || 0.5);
      formulas.push(
        `(sin(uv.x * 3.14 * ${freqX} + 3.14 * ${piOffsetX}) * 0.5 + 0.5)`
      );
    }
    if (options.y) {
      let freqY = ensureFloat(options.frequencyY || 2);
      let piOffsetY = ensureFloat(options.piOffsetY || 0.5);
      formulas.push(
        `(sin(uv.y * 3.14 * ${freqY} + 3.14 * ${piOffsetY}) * 0.5 + 0.5)`
      );
    }
    const joinWith = options.joinWith || "multiplication";
    let final = formulas[0];
    if (formulas.length === 0) {
      final = "0";
    }
    if (formulas.length > 1) {
      switch (joinWith) {
        case "sum":
          final = `(${final}+ ${formulas[1]})/2.`;
          break;
        case "multiplication":
          final = final + "*" + formulas[1];
          break;
        case "max":
          final = `max(${final}, ${formulas[1]})`;
          break;
        case "min":
          final = `min(${final}, ${formulas[1]})`;
          break;
        default:
          final = final + "*" + formulas[1];
          break;
      }
    }
    return `
    float getActivation(vec2 uv){
      return ${final};
    }
    `;
  }
};
function ensureFloat(num) {
  let stringed = num.toString();
  const dotIndex = stringed.indexOf(".");
  if (dotIndex === -1) {
    stringed += ".";
  }
  return stringed;
}
const transformations = {
  none: () => "",
  flipX: (options, shaderInfo) => {
    let c0x = ensureFloat(options.beizerC0x || 0.5);
    let c0y = ensureFloat(options.beizerC0y || 0.5);

    let c1x = ensureFloat(options.beizerC1x || 0.5);
    let c1y = ensureFloat(options.beizerC1y || 0.5);

    let textureFlip = "";
    if (shaderInfo.timing.type === "sameEnd") {
      const latestStart = ensureFloat(
        shaderInfo.timing.props.latestStart || 0.5
      );
      textureFlip = `
          // Flip texture on flipped sections 
            
            // Flip the controls because who knows why
            // But it works exactly

          // Multiply by aspect ratio to account for mesh scaling
          float aspectRatio = (uMeshScale.x / uMeshScale.y);
          float stepFormula = 0.5 - (${latestStart} * ${latestStart} * ${latestStart}) * aspectRatio;

          transformedUV.x = mix(transformedUV.x,1.-transformedUV.x,
              step(stepFormula,beizerProgress));
      `;
    }

    // Only works with sync ending
    return `
    
        float beizerProgress = cubicBezier(vertexProgress,
        ${c0x},${c0y},
        ${c1x},${c1y});

        float flippedX = -transformedPos.x;
        transformedPos.x = mix (transformedPos.x, flippedX,beizerProgress );
        
        ${textureFlip}
      `;
  },
  simplex: props => {
    let seed = ensureFloat(props.seed || 0);
    let amplitudeX = ensureFloat(props.amplitudeX || 0.2);
    let amplitudeY = ensureFloat(props.amplitudeY || 0.2);
    let frequencyX = ensureFloat(props.frequencyX || 0.3);
    let frequencyY = ensureFloat(props.frequencyY || 0.3);
    let progressLimit = ensureFloat(props.progressLimit || 0.5);
    return `
      float simplexProgress = min(clamp((vertexProgress) / ${progressLimit},0.,1.),clamp((1.-vertexProgress) / (1.-${progressLimit}),0.,1.));
      simplexProgress = smoothstep(0.,1.,simplexProgress);
      float noiseX = snoise(vec2(transformedPos.x +uSeed, transformedPos.y + uSeed + simplexProgress * 1.) * ${frequencyX} ) ;
      float noiseY = snoise(vec2(transformedPos.y +uSeed, transformedPos.x + uSeed + simplexProgress * 1.) * ${frequencyY}) ;
      transformedPos.x += ${amplitudeX} * noiseX * simplexProgress;
      transformedPos.y += ${amplitudeY} * noiseY * simplexProgress;
  `;
  },
  fluid: props => {
    const frequency = ensureFloat(props.frequency || 1);
    const amplitude = ensureFloat(props.amplitude || 0.3);
    let x = ensureFloat((props.x || 0.5) - 0.5);
    let y = ensureFloat((props.y || 0.5) - 0.5);
    if (props.onMouse) {
      x = "uMouse.x - 0.5";
      y = "uMouse.y - 0.5";
    }
    const progressLimit = ensureFloat(props.progressLimit || 0.5);
    return `
      float velvetProgress = min(clamp((vertexProgress) / ${progressLimit},0.,1.),clamp((1.-vertexProgress) / (1.-${progressLimit}),0.,1.));
      velvetProgress = sin(velvetProgress * (3.14 / 2.) * ${frequency});
      vec2 velvetPoint   = vec2(${x},${y}); 
      vec2 velvetToPoint =  transformedPos.xy;
      transformedPos.xy = mix(transformedPos.xy, velvetPoint + velvetToPoint*${amplitude}, velvetProgress);
     
    `;
  },
  wavy: props => {
    const seed = ensureFloat(props.seed || 0);
    const amplitude = ensureFloat(props.amplitude || 0.4);
    const frequency = ensureFloat(props.frequency || 4);
    return `
      float limit = 0.5;
      float wavyProgress = min(clamp((vertexProgress) / limit,0.,1.),clamp((1.-vertexProgress) / (1.-limit),0.,1.));

      float dist = length(transformedPos.xy);
      
      float angle = atan(transformedPos.x,transformedPos.y);

      float nextDist = dist * (${amplitude} * (sin(angle * ${frequency} + ${seed}) /2.+0.5)+ 1.);

      transformedPos.x = mix(transformedPos.x,sin(angle) * nextDist ,  wavyProgress);
      transformedPos.y = mix(transformedPos.y,cos(angle) * nextDist,  wavyProgress);
    `;
  },
  circle: props => {
    return `
      float limit = 0.5;
      float circleProgress = min(clamp((vertexProgress) / limit,0.,1.),clamp((1.-vertexProgress) / (1.-limit),0.,1.));

      float maxDistance = 0.5;
      float dist = length(transformedPos.xy);
      
      float nextDist = min(maxDistance,dist);
      float overload = step(maxDistance,dist);
      float angle = atan(transformedPos.x,transformedPos.y);
      
      transformedPos.x = mix(transformedPos.x,sin(angle) * nextDist ,  circleProgress );
      transformedPos.y = mix(transformedPos.y,cos(angle) * nextDist,  circleProgress);
      transformedPos.z += -0.5 * overload * circleProgress;
    
  `;
  },
  rotation: props => {
    const angle = props.angle || 360;
    const PIslice = ensureFloat(angle / 360);

    let progress = "vertexProgress";
    if (props.unify) {
      progress = "uProgress";
    }
    return `
      mat2 rotation = rotate2d(${progress}*(3.14*2.)*${PIslice});
      transformedUV.xy -= 0.5;
      transformedUV.xy = rotation * transformedUV.xy;
      transformedUV.xy += 0.5;

      transformedPos.xy = rotation * transformedPos.xy;
    `;
  }
};
var vertexUniforms = `
    uniform float uProgress;
    uniform vec2 uScaleToViewSize;
    uniform vec2 uPlaneCenter;
    uniform vec2 uMeshScale;
    uniform vec2 uMouse;
    uniform vec2 uViewSize;

    uniform float uClosestCorner;

    // Option Uniforms
    uniform float uSeed;
    varying vec2 vUv;
    varying vec2 scale; 
    varying float vProgress;
    varying float vActivation;

`;

var cubicBeizer = `
// Helper functions:
float slopeFromT (float t, float A, float B, float C){
  float dtdx = 1.0/(3.0*A*t*t + 2.0*B*t + C); 
  return dtdx;
}

float xFromT (float t, float A, float B, float C, float D){
  float x = A*(t*t*t) + B*(t*t) + C*t + D;
  return x;
}

float yFromT (float t, float E, float F, float G, float H){
  float y = E*(t*t*t) + F*(t*t) + G*t + H;
  return y;
}
float cubicBezier (float x, float a, float b, float c, float d){

  float y0a = 0.00; // initial y
  float x0a = 0.00; // initial x 
  float y1a = b;    // 1st influence y   
  float x1a = a;    // 1st influence x 
  float y2a = d;    // 2nd influence y
  float x2a = c;    // 2nd influence x
  float y3a = 1.00; // final y 
  float x3a = 1.00; // final x 

  float A =   x3a - 3.*x2a + 3.*x1a - x0a;
  float B = 3.*x2a - 6.*x1a + 3.*x0a;
  float C = 3.*x1a - 3.*x0a;   
  float D =   x0a;

  float E =   y3a - 3.*y2a + 3.*y1a - y0a;    
  float F = 3.*y2a - 6.*y1a + 3.*y0a;             
  float G = 3.*y1a - 3.*y0a;             
  float H =   y0a;

  // Solve for t given x (using Newton-Raphelson), then solve for y given t.
  // Assume for the first guess that t = x.
  float currentt = x;
  const int nRefinementIterations = 5;
  for (int i=0; i < nRefinementIterations; i++){
    float currentx = xFromT (currentt, A,B,C,D); 
    float currentslope = slopeFromT (currentt, A,B,C);
    currentt -= (currentx - x)*(currentslope);
    currentt = clamp(currentt, 0.,1.);
  } 

  float y = yFromT (currentt,  E,F,G,H);
  return y;
}
`;
var simplex = `
vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
           -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
  + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
    dot(x12.zw,x12.zw)), 0.0);
  m = m*m ;
  m = m*m ;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
`;

var quadraticBezier = `
float quadraticBezier (float x, float a, float b){
  // adapted from BEZMATH.PS (1993)
  // by Don Lancaster, SYNERGETICS Inc. 
  // http://www.tinaja.com/text/bezmath.html

  float epsilon = 0.00001;
  a = max(0., min(1., a)); 
  b = max(0., min(1., b)); 
  if (a == 0.5){
    a += epsilon;
  }
  
  // solve t from x (an inverse operation)
  float om2a = 1. - 2.*a;
  float t = (sqrt(a*a + om2a*x) - a)/om2a;
  float y = (1.-2.*b)*(t*t) + (2.*b)*t;
  return y;
}
`;
