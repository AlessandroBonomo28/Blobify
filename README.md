# BLOBify 🗿

**Protect your privacy from cloud providers.** Encrypt and decrypt your photos locally in PNG format!

> ⚠️ **Disclaimer**: This is an experimental project for educational and research purposes. The author assumes no responsibility for misuse or damage resulting from the use of this project. Use responsibly and in compliance with applicable laws.

<img width="350" alt="icon" src="https://github.com/user-attachments/assets/ec99f905-c7c9-4c52-96a8-4ccdb53ebef6" />

---

## 🚀 Quick Start (Easy Way)

1. **Install the Chrome extension** in your browser
   - Watch the tutorial: [How to install custom Chrome extensions](https://www.youtube.com/watch?v=oswjtLwCUqg)

2. **Encrypt your photos** using the Blobify program
   - Download the latest release from the **Releases page** https://github.com/AlessandroBonomo28/Blobify/releases/tag/1.0.0

3. **Upload encrypted photos** to Google Photos
   - ⚠️ **Important**: Select **NO COMPRESSION** when uploading

4. **View your photos**
   - Enable the Blobify extension
   - Reload the Google Photos website
   - Your encrypted photos will be automatically decrypted in your browser

---

## 🛠️ Build and Run from Source

### Prerequisites
- Python 3.7 or higher

### Setup

```bash
# Create virtual environment
python -m venv env

# Activate environment (Windows)
env\Scripts\activate

# Activate environment (Linux/macOS)
source env/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the application
python blobify.py
```

### Testing

You can also test encryption and decryption separately:

```bash
python encrypt.py
python decrypt.py
```

---

## 📦 Build Executable

### Windows

```bash
cd python-app

pyinstaller --onefile --windowed ^
    --add-data "icon.png;." ^
    --add-data "icon-name.png;." ^
    --icon=icon.png ^
    blobify.py
```

### Linux

```bash
cd python-app

pyinstaller -D -F -n blobify -c blobify.py \
    --add-data "icon.png:." \
    --add-data "icon-name.png:." \
    --icon=icon.png
```

The executable will be created in the `dist` folder.

---

## 📋 Features

- 🔐 Local encryption/decryption (your keys never leave your device)
- 🖼️ PNG format support
- 🌐 Browser extension for seamless viewing
- 💾 Compatible with Google Photos and other cloud storage

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

