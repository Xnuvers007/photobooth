import urllib.request
import os

os.makedirs('assets/models', exist_ok=True)

files = {
    'assets/js/face-api.min.js': 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.min.js',
    'assets/models/tiny_face_detector_model-weights_manifest.json': 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/tiny_face_detector_model-weights_manifest.json',
    'assets/models/tiny_face_detector_model-shard1': 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/tiny_face_detector_model-shard1'
}

for filepath, url in files.items():
    print(f"Downloading {url} to {filepath}...")
    urllib.request.urlretrieve(url, filepath)

print("Done!")
