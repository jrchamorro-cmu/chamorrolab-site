import json, math
W=1100
LON0,LON1=118,408   # Americas centred: Japan at the left edge, Europe at the right
LAT0,LAT1=-46,72
sx=W/(LON1-LON0)            # px per degree lon
R=sx*180/math.pi            # px per radian
def my(lat): return 1.25*math.log(math.tan(math.pi/4+0.4*math.radians(lat)))
TOP=my(LAT1); H=round((TOP-my(LAT0))*R)
def P(lon,lat): return ((lon-LON0)*sx, (TOP-my(lat))*R)
def S(lon,lat):
    # sites: wrap into the map's longitude window
    if lon<LON0: lon+=360
    return P(lon,lat)
d=json.load(open(__import__('os').path.join(__import__('os').path.dirname(__file__),'ne_110m_land.geojson')))
paths=[]
for f in d['features']:
    g=f['geometry']; polys=g['coordinates'] if g['type']=='MultiPolygon' else [g['coordinates']]
    for poly in polys:
        for ring in poly:
            for shift in (0,360):
                pts=[P(x+shift,y) for x,y in ring]
                if max(p[0] for p in pts)<0 or min(p[0] for p in pts)>W or min(p[1] for p in pts)>H: continue
                xs=[p[0] for p in pts]; ys=[p[1] for p in pts]
                if (max(xs)-min(xs))*(max(ys)-min(ys))<6: continue
                paths.append("M"+" ".join(f"{x:.1f},{y:.1f}" for x,y in pts)+"Z")
land="".join(paths)
# name, lon, lat, label, label anchor, dx, dy
sites=[
 ("home","Carnegie Mellon University",-79.94,40.44,"CMU","middle",0,-13),
 ("aps","Advanced Photon Source",-87.98,41.71,"APS","end",-6,-6),
 ("llnl","Lawrence Livermore National Laboratory",-121.70,37.69,"LLNL","end",-9,4),
 ("lanl","Los Alamos National Laboratory",-106.30,35.88,"LANL","middle",0,17),
 ("bnl","Brookhaven National Laboratory",-72.87,40.87,"BNL","start",7,-6),
 ("nist","NIST Center for Neutron Research",-77.20,39.13,"NIST","start",7,14),
 ("ornl","Oak Ridge National Laboratory",-84.31,35.93,"ORNL","end",-8,4),
 ("nhmfl","National High Magnetic Field Laboratory",-84.28,30.44,"NHMFL","middle",0,17),
 ("cls","Canadian Light Source",-106.63,52.13,"CLS","start",8,4),
 ("triumf","TRIUMF",-123.23,49.25,"TRIUMF","end",-8,4),
 ("isis","ISIS Neutron and Muon Source",-1.31,51.57,"ISIS and Diamond","end",-9,3),
 ("ill","Institut Laue-Langevin",5.69,45.21,"ILL","end",-8,10),
 ("psi","Paul Scherrer Institute",8.22,47.53,"PSI","start",9,5),
 ("desy","DESY",9.88,53.58,"DESY","end",-4,-9),
 ("bessy","BESSY II",13.13,52.43,"BESSY II","start",9,2),
 ("jparc","J-PARC and JRR-3",140.61,36.44,"J-PARC and JRR-3","start",9,5),
]
hx,hy=S(-79.94,40.44)
out=[f'<svg class="wmap" viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="wmap-title">']
out.append('<title id="wmap-title">World map of the facilities where the group runs experiments</title>')
out.append(f'<path class="land" d="{land}"/>')
# arcs from home
for k,n,lon,lat,lab,anc,dx,dy in sites:
    if k=="home": continue
    x,y=S(lon,lat); mx=(hx+x)/2; dist=math.hypot(x-hx,y-hy); cy=min(hy,y)-dist*0.22
    out.append(f'<path class="arc" d="M{hx:.1f},{hy:.1f} Q{mx:.1f},{cy:.1f} {x:.1f},{y:.1f}"/>')
for k,n,lon,lat,lab,anc,dx,dy in sites:
    x,y=S(lon,lat)
    if k=="home":
        out.append(f'<circle class="dot home" cx="{x:.1f}" cy="{y:.1f}" r="6.5"/><circle class="dotcore" cx="{x:.1f}" cy="{y:.1f}" r="3"/>')
    else:
        out.append(f'<circle class="dot" cx="{x:.1f}" cy="{y:.1f}" r="4.2"/>')
    out.append(f'<text class="mlabel" x="{x+dx:.1f}" y="{y+dy:.1f}" text-anchor="{anc}">{lab}</text>')
out.append('</svg>')
svg="\n".join(out)
open(__import__('os').path.join(__import__('os').path.dirname(__file__),'wmap.svg'),'w').write(svg)
print(H, len(svg))
for k,n,lon,lat,lab,anc,dx,dy in sites: print(k, [round(v) for v in S(lon,lat)])
