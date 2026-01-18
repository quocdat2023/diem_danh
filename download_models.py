import urllib.request
import os

def download_chunked(url, filename, total_size):
    print(f"Downloading {filename} (Size: {total_size})...")
    chunk_size = 1024 * 1024 # 1MB
    
    with open(filename, 'wb') as f:
        start = 0
        while start < total_size:
            end = min(start + chunk_size - 1, total_size - 1)
            print(f"  Downloading bytes={start}-{end}")
            
            req = urllib.request.Request(url)
            req.add_header('Range', f'bytes={start}-{end}')
            
            try:
                with urllib.request.urlopen(req) as response:
                    content = response.read()
                    f.write(content)
            except Exception as e:
                print(f"Error downloading chunk {start}-{end}: {e}")
                return
                
            start = end + 1
            
    print(f"Downloaded {filename} successfully.")

base_url = "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/"
models = [
    ("ssd_mobilenetv1_model-shard1", 5468918),
    ("face_recognition_model-shard1", 6554804)
]

if not os.path.exists("static/models"):
    os.makedirs("static/models")

for name, size in models:
    download_chunked(base_url + name, f"static/models/{name}", size)
