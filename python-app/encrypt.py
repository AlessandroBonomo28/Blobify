from PIL import Image
from Crypto.Cipher import AES
from Crypto.Protocol.KDF import PBKDF2
from Crypto.Random import get_random_bytes
import base64, struct, os

def encrypt_data(data: bytes, password: str) -> bytes:
    """Cifra i dati con AES-GCM e password."""
    salt = get_random_bytes(16)
    key = PBKDF2(password, salt, dkLen=32, count=200000)
    cipher = AES.new(key, AES.MODE_GCM)
    ciphertext, tag = cipher.encrypt_and_digest(data)
    return salt + cipher.nonce + tag + ciphertext

def embed_to_png(encrypted_data: bytes, output_path: str):
    """Embedda i dati cifrati in un'immagine PNG (grayscale)."""
    b64 = base64.b64encode(encrypted_data)
    size = int(len(b64) ** 0.5) + 1
    img = Image.new("L", (size, size))
    pixels = img.load()

    i = 0
    for y in range(size):
        for x in range(size):
            if i < len(b64):
                pixels[x, y] = b64[i]
                i += 1
            else:
                pixels[x, y] = 0
    img.save(output_path, "PNG")

def main():
    input_path = input("File da criptare (es. prova.webp): ")
    password = input("Password: ")
    output_path = input("Nome file di output PNG (es. criptato.png): ")

    ext = os.path.splitext(input_path)[1]
    with open(input_path, "rb") as f:
        raw_data = f.read()

    # Prepara dati con estensione incorporata
    ext_bytes = ext.encode("utf-8")
    packed = struct.pack("B", len(ext_bytes)) + ext_bytes + raw_data

    encrypted = encrypt_data(packed, password)
    embed_to_png(encrypted, output_path)

    print(f"[✅] File criptato salvato in {output_path}")
    print(f"    → Estensione originale: {ext}")

if __name__ == "__main__":
    main()
