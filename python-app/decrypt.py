from PIL import Image
from Crypto.Cipher import AES
from Crypto.Protocol.KDF import PBKDF2
import base64, struct

def extract_data_from_png(path: str) -> bytes:
    """Estrae i dati Base64 da un PNG grigio."""
    img = Image.open(path).convert("L")
    pixels = list(img.getdata())
    raw_bytes = bytes(pixels)
    return base64.b64decode(raw_bytes)

def decrypt_data(encrypted_data: bytes, password: str) -> bytes:
    """Decifra i dati AES-GCM."""
    salt = encrypted_data[:16]
    nonce = encrypted_data[16:32]
    tag = encrypted_data[32:48]
    ciphertext = encrypted_data[48:]
    key = PBKDF2(password, salt, dkLen=32, count=200000)
    cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
    return cipher.decrypt_and_verify(ciphertext, tag)

def main():
    input_path = input("Immagine PNG criptata: ")
    password = input("Password: ")

    encrypted = extract_data_from_png(input_path)
    data = decrypt_data(encrypted, password)

    # Estrai estensione e contenuto
    ext_len = struct.unpack("B", data[:1])[0]
    ext = data[1:1+ext_len].decode("utf-8")
    file_bytes = data[1+ext_len:]

    output_path = f"output{ext}"
    with open(output_path, "wb") as f:
        f.write(file_bytes)

    print(f"[✅] File decriptato salvato come {output_path}")

if __name__ == "__main__":
    main()
