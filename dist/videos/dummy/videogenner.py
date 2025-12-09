import shutil

# Path to your original file
original_file = '1.mp4'

# Create duplicates named 2.mp4 to 360.mp4
for i in range(2, 361):
    new_file = f"{i}.mp4"
    shutil.copyfile(original_file, new_file)
    print(f"Created {new_file}")
