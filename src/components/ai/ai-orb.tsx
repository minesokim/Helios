'use client'

import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Shader for the orb
const orbVertexShader = `
  uniform float time;
  uniform float intensity;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;

  // Noise function
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main() {
    vUv = uv;
    vNormal = normal;
    vPosition = position;

    vec3 pos = position;
    float noise = snoise(pos * 2.0 + time * 0.5) * intensity * 0.15;
    pos += normal * noise;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`

const orbFragmentShader = `
  uniform float time;
  uniform float intensity;
  uniform vec3 color1;
  uniform vec3 color2;
  uniform vec3 color3;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vec3 viewDirection = normalize(cameraPosition - vPosition);
    float fresnel = pow(1.0 - dot(viewDirection, vNormal), 3.0);

    float pattern = sin(vUv.x * 20.0 + time * 2.0) * sin(vUv.y * 20.0 + time * 1.5);
    pattern += sin(vUv.x * 10.0 - time) * cos(vUv.y * 15.0 + time * 0.8) * 0.5;

    vec3 color = mix(color1, color2, pattern * 0.5 + 0.5);
    color = mix(color, color3, fresnel * intensity);

    float glow = fresnel * 0.8 + 0.2;
    float alpha = 0.85 + fresnel * 0.15;

    gl_FragColor = vec4(color * glow, alpha);
  }
`

export type OrbState = 'idle' | 'listening' | 'processing' | 'speaking'

interface OrbProps {
  state?: OrbState
}

function Orb({ state = 'idle' }: OrbProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const glowRef = useRef<THREE.Mesh>(null)

  const intensityMap: Record<OrbState, number> = {
    idle: 0.3,
    listening: 1.0,
    processing: 0.7,
    speaking: 1.2
  }

  const colorMap: Record<OrbState, { c1: string; c2: string; c3: string }> = {
    idle: { c1: '#1a1a2e', c2: '#16213e', c3: '#0f3460' },
    listening: { c1: '#ff6b6b', c2: '#ee5a24', c3: '#ff9f43' },
    processing: { c1: '#4834d4', c2: '#686de0', c3: '#a29bfe' },
    speaking: { c1: '#00d2d3', c2: '#54a0ff', c3: '#5f27cd' }
  }

  const colors = colorMap[state] || colorMap.idle
  const targetIntensity = intensityMap[state] || 0.3

  const uniforms = useMemo(() => ({
    time: { value: 0 },
    intensity: { value: targetIntensity },
    color1: { value: new THREE.Color(colors.c1) },
    color2: { value: new THREE.Color(colors.c2) },
    color3: { value: new THREE.Color(colors.c3) },
  }), [])

  useFrame((frameState, delta) => {
    if (meshRef.current) {
      uniforms.time.value = frameState.clock.elapsedTime

      // Smooth intensity transition
      uniforms.intensity.value += (targetIntensity - uniforms.intensity.value) * 0.05

      // Update colors smoothly
      uniforms.color1.value.lerp(new THREE.Color(colors.c1), 0.05)
      uniforms.color2.value.lerp(new THREE.Color(colors.c2), 0.05)
      uniforms.color3.value.lerp(new THREE.Color(colors.c3), 0.05)

      // Rotation based on state
      const rotationSpeed = state === 'idle' ? 0.1 : state === 'listening' ? 0.3 : state === 'speaking' ? 0.5 : 0.2
      meshRef.current.rotation.y += delta * rotationSpeed
      meshRef.current.rotation.x = Math.sin(frameState.clock.elapsedTime * 0.5) * 0.1

      // Scale pulse for speaking
      if (state === 'speaking') {
        const scale = 1 + Math.sin(frameState.clock.elapsedTime * 8) * 0.03
        meshRef.current.scale.setScalar(scale)
      } else if (state === 'listening') {
        const scale = 1 + Math.sin(frameState.clock.elapsedTime * 4) * 0.05
        meshRef.current.scale.setScalar(scale)
      } else {
        meshRef.current.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1)
      }
    }

    if (glowRef.current) {
      glowRef.current.rotation.y -= delta * 0.2
      const glowScale = 1.2 + Math.sin(frameState.clock.elapsedTime * 2) * 0.1 * targetIntensity
      glowRef.current.scale.setScalar(glowScale)
    }
  })

  return (
    <group>
      {/* Outer glow */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[1.3, 32, 32]} />
        <meshBasicMaterial
          color={colors.c3}
          transparent
          opacity={0.1 * targetIntensity}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Main orb */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[1, 64, 64]} />
        <shaderMaterial
          uniforms={uniforms}
          vertexShader={orbVertexShader}
          fragmentShader={orbFragmentShader}
          transparent
        />
      </mesh>

      {/* Inner core */}
      <mesh>
        <sphereGeometry args={[0.3, 32, 32]} />
        <meshBasicMaterial color={colors.c3} transparent opacity={0.8} />
      </mesh>
    </group>
  )
}

interface AIThreeOrbProps {
  state?: OrbState
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export function AIOrb({ state = 'idle', className = '', size = 'lg' }: AIThreeOrbProps) {
  const sizeMap = {
    sm: { width: 120, height: 120 },
    md: { width: 200, height: 200 },
    lg: { width: 280, height: 280 },
  }

  const { width, height } = sizeMap[size]

  return (
    <div className={className} style={{ width, height }}>
      <Canvas camera={{ position: [0, 0, 4], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <pointLight position={[-10, -10, -10]} intensity={0.5} color="#4834d4" />
        <Orb state={state} />
      </Canvas>
    </div>
  )
}

// CSS-only mini orb for performance (no Three.js)
interface MiniOrbProps {
  onClick?: () => void
  className?: string
}

export function MiniOrb({ onClick, className = '' }: MiniOrbProps) {
  return (
    <button
      className={`mini-orb ${className}`}
      onClick={onClick}
      aria-label="Talk to Helios"
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    </button>
  )
}
