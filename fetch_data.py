import urllib.request
import json
import os

overpass_url = "http://overpass-api.de/api/interpreter"
overpass_query = """
[out:json][timeout:25];
area["name"="Harare"]->.searchArea;
(
  node["amenity"~"hospital|clinic|pharmacy|doctors|dentist"](area.searchArea);
  way["amenity"~"hospital|clinic|pharmacy|doctors|dentist"](area.searchArea);
);
out center;
"""

print("Fetching data from Overpass API...")
req = urllib.request.Request(overpass_url, data=overpass_query.encode('utf-8'))
try:
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode('utf-8'))
        
    features = []
    for element in data['elements']:
        lon = element.get('lon') or (element.get('center', {})).get('lon')
        lat = element.get('lat') or (element.get('center', {})).get('lat')
        if not lon or not lat: continue
        
        tags = element.get('tags', {})
        name = tags.get('name', 'Unnamed Facility')
        amenity = tags.get('amenity', 'unknown')
        
        feature = {
            "type": "Feature",
            "properties": {
                "name": name,
                "healthcare": amenity,
                **tags
            },
            "geometry": {
                "type": "Point",
                "coordinates": [lon, lat]
            }
        }
        features.append(feature)

    geojson = {
        "type": "FeatureCollection",
        "features": features
    }

    with open('data/harare.geojson', 'w', encoding='utf-8') as f:
        json.dump(geojson, f, indent=2, ensure_ascii=False)
    print(f"Saved {len(features)} facilities to data/harare.geojson")
except Exception as e:
    print("Error:", e)
