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

varying vec4 texcoord[N];
uniform sampler2D texture[N];
uniform vec2      size[N];

#ifdef WITH_DISTORT
uniform vec2      pps[N];
uniform vec4      distortion[N];
uniform vec3      l1l2[N];
#endif
const float borderfadeoutinv = 0.02;
float getUV(inout vec2 p, vec2 s)
{
   p.y = s.y-p.y;
   vec2 d = min(p.xy,s-p.xy);
   p/=s;
   return min(d.x,d.y);
}
#ifdef WITH_DISTORT
void distort(inout vec2 p, vec4 adist, vec2 apps)
{
   vec2 v = p - apps;
   float v2 = dot(v,v);
   if(v2>adist.w) p = vec2(-1.);
   else p += (v2*(adist.x+v2*(adist.y+v2*adist.z)))*v;
}
void distort(inout vec2 p, vec4 dist, vec3 l1l2, vec2 pps)
{ 
   if ((l1l2.x == 0.)&&(l1l2.y == 0.)) distort(p,dist,pps);
   else {
   vec2 AB = 1./l1l2.z*(p-pps);
   float R = sqrt(dot(AB,AB));
   float lambda = atan(R)/R;
   vec2 ab = lambda*AB;
   float rho2 = dot(ab,ab);
   float r357 = (1. + rho2* (dist.x + rho2* (dist.y + rho2*dist.z)))*l1l2.z;
   p = pps + r357*ab + vec2((l1l2.x*ab.x+l1l2.y*ab.y)*l1l2.z,l1l2.y*ab.x*l1l2.z);
   }
}

#endif
void main(void)
{
#if defined(USE_LOGDEPTHBUF) && defined(USE_LOGDEPTHBUF_EXT)
   gl_FragDepthEXT = log2(vFragDepth) * logDepthBufFC * 0.5;
#endif
    vec4 color  = vec4(0.);
    vec2 p;
    vec4 c;
    float d;
    int blend = 0;
