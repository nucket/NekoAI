from PIL import Image
import os, sys

src = sys.argv[1] if len(sys.argv) > 1 else 'pets/classic-neko/sprites/ico'
dst = sys.argv[2] if len(sys.argv) > 2 else 'pets/classic-neko/sprites'

os.makedirs(dst, exist_ok=True)
converted = 0
for f in os.listdir(src):
    if f.lower().endswith('.ico'):
        img = Image.open(os.path.join(src, f)).convert('RGBA')
        out = os.path.join(dst, f.replace('.ico', '.png').lower())
        img.save(out)
        print(f'✓ {f} → {os.path.basename(out)}')
        converted += 1
print(f'\nDone: {converted} files converted')
