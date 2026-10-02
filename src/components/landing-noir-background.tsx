"use client";

import { useEffect, useRef } from "react";

const IMAGE_URL = "/janja-live-noir.png";
const TARGET_FRAME_TIME = 1000 / 30;
const RENDER_SCALE = 0.72;

const vertexShaderSource = `
  attribute vec2 a_position;
  varying vec2 v_uv;

  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const webgl2VertexShaderSource = `#version 300 es
  in vec2 a_position;
  out vec2 v_uv;

  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const fragmentShaderSource = `
  precision mediump float;

  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform vec2 u_imageResolution;
  uniform float u_time;

  varying vec2 v_uv;

  float random(vec2 point) {
    return fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec2 fittedScale = u_resolution / u_imageResolution;
    float coverScale = max(fittedScale.x, fittedScale.y);
    vec2 scaledImage = u_imageResolution * coverScale;
    vec2 uv = (v_uv - 0.5) * (u_resolution / scaledImage) + 0.5;

    float sequence = floor(u_time / 6.5);
    float sequenceProgress = fract(u_time / 6.5);
    float trackingEnabled = step(0.28, random(vec2(sequence, 9.17)));
    float trackingPosition = mix(1.12, -0.12, smoothstep(0.08, 0.92, sequenceProgress));
    float trackingBand = smoothstep(0.024, 0.0, abs(v_uv.y - trackingPosition));
    float trackingStrength = mix(0.002, 0.006, random(vec2(sequence, 3.41)));

    uv.x += trackingBand * trackingEnabled * trackingStrength;

    vec3 color = texture2D(u_texture, uv).rgb;
    float grain = random(gl_FragCoord.xy + vec2(u_time * 41.0, u_time * 17.0)) - 0.5;
    float lineNoise = random(vec2(floor(gl_FragCoord.y * 0.24), floor(u_time * 16.0))) - 0.5;
    float flicker = 1.0 + sin(u_time * 7.0) * 0.0035;

    color *= flicker;
    color += grain * 0.026;
    color += lineNoise * 0.009;
    color += trackingBand * trackingEnabled * 0.018;

    gl_FragColor = vec4(color, 1.0);
  }
`;

const webgl2FragmentShaderSource = `#version 300 es
  precision mediump float;

  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform vec2 u_imageResolution;
  uniform float u_time;

  in vec2 v_uv;
  out vec4 outputColor;

  float random(vec2 point) {
    return fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec2 fittedScale = u_resolution / u_imageResolution;
    float coverScale = max(fittedScale.x, fittedScale.y);
    vec2 scaledImage = u_imageResolution * coverScale;
    vec2 uv = (v_uv - 0.5) * (u_resolution / scaledImage) + 0.5;

    float sequence = floor(u_time / 6.5);
    float sequenceProgress = fract(u_time / 6.5);
    float trackingEnabled = step(0.28, random(vec2(sequence, 9.17)));
    float trackingPosition = mix(1.12, -0.12, smoothstep(0.08, 0.92, sequenceProgress));
    float trackingBand = smoothstep(0.024, 0.0, abs(v_uv.y - trackingPosition));
    float trackingStrength = mix(0.002, 0.006, random(vec2(sequence, 3.41)));

    uv.x += trackingBand * trackingEnabled * trackingStrength;

    vec3 color = texture(u_texture, uv).rgb;
    float grain = random(gl_FragCoord.xy + vec2(u_time * 41.0, u_time * 17.0)) - 0.5;
    float lineNoise = random(vec2(floor(gl_FragCoord.y * 0.24), floor(u_time * 16.0))) - 0.5;
    float flicker = 1.0 + sin(u_time * 7.0) * 0.0035;

    color *= flicker;
    color += grain * 0.026;
    color += lineNoise * 0.009;
    color += trackingBand * trackingEnabled * 0.018;

    outputColor = vec4(color, 1.0);
  }
`;

export function LandingNoirBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) return;

    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: "low-power",
      preserveDrawingBuffer: false,
    }) ?? canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: "low-power",
      preserveDrawingBuffer: false,
    });

    if (!gl) return;

    const usesWebgl2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;

    const compileShader = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;

      gl.shaderSource(shader, source);
      gl.compileShader(shader);

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }

      return shader;
    };

    const vertexShader = compileShader(
      gl.VERTEX_SHADER,
      usesWebgl2 ? webgl2VertexShaderSource : vertexShaderSource,
    );
    const fragmentShader = compileShader(
      gl.FRAGMENT_SHADER,
      usesWebgl2 ? webgl2FragmentShaderSource : fragmentShaderSource,
    );
    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    if (!program) return;

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return;
    }

    const positionLocation = gl.getAttribLocation(program, "a_position");
    const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
    const imageResolutionLocation = gl.getUniformLocation(program, "u_imageResolution");
    const timeLocation = gl.getUniformLocation(program, "u_time");
    const textureLocation = gl.getUniformLocation(program, "u_texture");
    const positionBuffer = gl.createBuffer();
    const texture = gl.createTexture();

    if (!positionBuffer || !texture) return;

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);

    const image = new Image();
    image.decoding = "async";
    let animationFrame = 0;
    let lastFrame = 0;
    let startedAt = 0;
    let disposed = false;

    const resize = () => {
      const width = Math.max(1, Math.floor(canvas.clientWidth * RENDER_SCALE));
      const height = Math.max(1, Math.floor(canvas.clientHeight * RENDER_SCALE));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    };

    const render = (timestamp: number) => {
      if (disposed) return;

      animationFrame = window.requestAnimationFrame(render);
      if (document.hidden || timestamp - lastFrame < TARGET_FRAME_TIME) return;

      lastFrame = timestamp;
      resize();
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(textureLocation, 0);
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
      gl.uniform2f(imageResolutionLocation, image.naturalWidth, image.naturalHeight);
      gl.uniform1f(timeLocation, (timestamp - startedAt) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      canvas.classList.remove("is-ready");
      window.cancelAnimationFrame(animationFrame);
    };

    image.addEventListener("load", () => {
      if (disposed) return;

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      startedAt = performance.now();
      canvas.classList.add("is-ready");
      animationFrame = window.requestAnimationFrame(render);
    }, { once: true });

    image.addEventListener("error", () => canvas.classList.remove("is-ready"), { once: true });
    canvas.addEventListener("webglcontextlost", handleContextLost);
    image.src = IMAGE_URL;

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.classList.remove("is-ready");
      gl.deleteTexture(texture);
      gl.deleteBuffer(positionBuffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
    };
  }, []);

  return (
    <div className="landing-noir" aria-hidden="true">
      <div className="landing-noir-static" />
      <canvas className="landing-noir-canvas" ref={canvasRef} />
    </div>
  );
}
