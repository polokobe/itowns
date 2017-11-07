import json

with open('panoramicsMetaData.json') as data_file:
		pano = json.load(data_file)

geojson={}
geojson['type']='FeatureCollection'
geojson['crs']={"type": "EPSG","properties": { "code": 2154}}
geojson['features']=[]

for p in pano:
	f={}
	f['type']='Feature'
	f['geometry']={'type': 'Point', 'coordinates':[p['easting'], p['northing'], p['altitude']]}
	f['properties']=p
	geojson['features'].append(f)

print json.dumps(geojson,sort_keys=True)
