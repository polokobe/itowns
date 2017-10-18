#ifdef GL_ES
    precision  highp float;
#endif

#ifdef USE_LOGDEPTHBUF
    #define EPSILON 1e-6
    #ifdef USE_LOGDEPTHBUF_EXT
        varying float vFragDepth;
    #endif
    uniform float logDepthBufFC;
#endif

uniform mat4 mvpp[N];
varying vec4 texcoord[N];
vec4 posView;

void main() {
    posView =  modelViewMatrix * vec4(position,1.);
    for(int i=0; i<N; ++i) texcoord[i] = mvpp[i] * posView;
    gl_Position = projectionMatrix * posView;
#ifdef USE_LOGDEPTHBUF
    gl_Position.z = log2(max( EPSILON, gl_Position.w + 1.0 )) * logDepthBufFC;
    #ifdef USE_LOGDEPTHBUF_EXT
        vFragDepth = 1.0 + gl_Position.w;
    #else
        gl_Position.z = (gl_Position.z - 1.0) * gl_Position.w;
    #endif
#endif
}
