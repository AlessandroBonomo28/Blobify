import sys
import os
import shutil
import subprocess
import platform
from PyQt5.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, 
                             QHBoxLayout, QLabel, QPushButton, QLineEdit, 
                             QRadioButton, QFileDialog, QProgressBar, 
                             QMessageBox, QGroupBox)
from PyQt5.QtCore import Qt, QThread, pyqtSignal
from PyQt5.QtGui import QIcon
from PIL import Image
from Crypto.Cipher import AES
from Crypto.Protocol.KDF import PBKDF2
from Crypto.Random import get_random_bytes
import base64
import struct

class WorkerThread(QThread):
    finished = pyqtSignal(bool, str)
    progress = pyqtSignal(str)
    
    def __init__(self, mode, target_type, path, password, output_base):
        super().__init__()
        self.mode = xSQXmode
        self.target_type = target_type
        self.path = path
        self.password = password
        self.output_base = output_base
    
    def run(self):
        try:
            if self.target_type == "folder":
                self.process_folder()
            else:
                self.process_file()
            self.finished.emit(True, "Operation completed successfully!")
        except Exception as e:
            import traceback
            error_msg = f"Error: {str(e)}\n\nDetails:\n{traceback.format_exc()}"
            self.finished.emit(False, error_msg)
    
    def process_folder(self):
        if self.mode == "encrypt":
            extensions = ('.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.tiff')
            output_folder = os.path.join(self.output_base, "encrypted_output")
        else:
            extensions = ('.png',)
            output_folder = os.path.join(self.output_base, "decrypted_output")
        
        if os.path.exists(output_folder):
            shutil.rmtree(output_folder)
        os.makedirs(output_folder, exist_ok=True)
        
        files_processed = 0
        for root, dirs, files in os.walk(self.path):
            if os.path.abspath(output_folder).startswith(os.path.abspath(self.path)):
                if os.path.abspath(root) == os.path.abspath(output_folder) or output_folder in root:
                    continue
            
            for file in files:
                if file.lower().endswith(extensions):
                    try:
                        input_path = os.path.join(root, file)
                        
                        if output_folder in input_path:
                            continue
                        
                        rel_path = os.path.relpath(root, self.path)
                        
                        if rel_path == '.':
                            out_dir = output_folder
                        else:
                            out_dir = os.path.join(output_folder, rel_path)
                        
                        os.makedirs(out_dir, exist_ok=True)
                        
                        self.progress.emit(f"Processing: {file}")
                        
                        if self.mode == "encrypt":
                            output_name = os.path.splitext(file)[0] + "_encrypted.png"
                            output_path = os.path.join(out_dir, output_name)
                            self.encrypt_file(input_path, output_path)
                        else:
                            self.decrypt_file(input_path, out_dir)
                        
                        files_processed += 1
                    except Exception as e:
                        self.progress.emit(f"Warning - Error on {file}: {str(e)}")
                        continue
        
        if files_processed == 0:
            raise Exception(f"No supported files found in {self.path}")
    
    def process_file(self):
        if self.mode == "encrypt":
            output_dir = os.path.join(self.output_base, "encrypted_output")
            if os.path.exists(output_dir):
                shutil.rmtree(output_dir)
            os.makedirs(output_dir, exist_ok=True)
            output_name = os.path.splitext(os.path.basename(self.path))[0] + "_encrypted.png"
            output_path = os.path.join(output_dir, output_name)
            self.encrypt_file(self.path, output_path)
        else:
            output_dir = os.path.join(self.output_base, "decrypted_output")
            if os.path.exists(output_dir):
                shutil.rmtree(output_dir)
            os.makedirs(output_dir, exist_ok=True)
            self.decrypt_file(self.path, output_dir)
    
    def encrypt_file(self, input_path, output_path):
        ext = os.path.splitext(input_path)[1]
        with open(input_path, "rb") as f:
            raw_data = f.read()
        
        ext_bytes = ext.encode("utf-8")
        packed = struct.pack("B", len(ext_bytes)) + ext_bytes + raw_data
        
        encrypted = self.encrypt_data(packed)
        self.embed_to_png(encrypted, output_path)
    
    def decrypt_file(self, input_path, output_folder):
        try:
            try:
                img_test = Image.open(input_path)
                if img_test.format != 'PNG':
                    raise Exception(f"File is not a valid PNG")
                img_test.close()
            except Exception as e:
                raise Exception(f"Cannot open file as PNG: {str(e)}")
            
            encrypted = self.extract_data_from_png(input_path)
            
            if len(encrypted) < 48:
                raise Exception(f"PNG not encrypted with this program (data too small)")
            
            data = self.decrypt_data(encrypted)
            
            if len(data) < 2:
                raise Exception(f"Invalid decrypted data")
            
            ext_len = struct.unpack("B", data[:1])[0]
            
            if ext_len > 10 or ext_len < 1:
                raise Exception(f"Invalid file extension (length: {ext_len})")
            
            if len(data) < 1 + ext_len:
                raise Exception(f"Decrypted data too small to contain extension")
            
            ext = data[1:1+ext_len].decode("utf-8")
            file_bytes = data[1+ext_len:]
            
            base_name = os.path.splitext(os.path.basename(input_path))[0]
            if base_name.endswith("_encrypted"):
                base_name = base_name[:-10]
            
            output_path = os.path.join(output_folder, f"{base_name}{ext}")
            
            counter = 1
            while os.path.exists(output_path):
                output_path = os.path.join(output_folder, f"{base_name}_{counter}{ext}")
                counter += 1
            
            with open(output_path, "wb") as f:
                f.write(file_bytes)
        except Exception as e:
            raise Exception(f"Error decrypting {os.path.basename(input_path)}: {str(e)}")
    
    def encrypt_data(self, data: bytes) -> bytes:
        salt = get_random_bytes(16)
        key = PBKDF2(self.password, salt, dkLen=32, count=200000)
        cipher = AES.new(key, AES.MODE_GCM)
        ciphertext, tag = cipher.encrypt_and_digest(data)
        return salt + cipher.nonce + tag + ciphertext
    
    def decrypt_data(self, encrypted_data: bytes) -> bytes:
        salt = encrypted_data[:16]
        nonce = encrypted_data[16:32]
        tag = encrypted_data[32:48]
        ciphertext = encrypted_data[48:]
        key = PBKDF2(self.password, salt, dkLen=32, count=200000)
        cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
        return cipher.decrypt_and_verify(ciphertext, tag)
    
    @staticmethod
    def embed_to_png(encrypted_data: bytes, output_path: str):
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
    
    @staticmethod
    def extract_data_from_png(path: str) -> bytes:
        img = Image.open(path).convert("L")
        pixels = list(img.getdata())
        raw_bytes = bytes(pixels)
        
        last_valid = len(raw_bytes)
        for i in range(len(raw_bytes) - 1, -1, -1):
            if raw_bytes[i] != 0:
                last_valid = i + 1
                break
        
        raw_bytes = raw_bytes[:last_valid]
        
        try:
            return base64.b64decode(raw_bytes)
        except Exception as e:
            raise Exception(f"Invalid PNG or not encrypted with this program: {e}")

def resource_path(relative_path : str):
    """ Restituisce il percorso assoluto alla risorsa, compatibile con PyInstaller """
    if hasattr(sys, '_MEIPASS'):
        # quando è in esecuzione dal .exe
        base_path = sys._MEIPASS
    else:
        # quando è in esecuzione dallo script .py
        base_path = os.path.abspath(os.path.dirname(__file__))
    return os.path.join(base_path, relative_path)

class ImageEncryptorApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.selected_path = ""
        self.mode = "encrypt"
        self.target_type = "folder"
        self.worker = None
        self.output_base = os.path.dirname(os.path.abspath(__file__))
        self.init_ui()
    
    def init_ui(self):
        self.setWindowTitle("BLOBIFY")
        self.setFixedSize(700, 680)
        
        # Carica l'icona se disponibile
        self.load_icon()
        
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QVBoxLayout(central_widget)
        main_layout.setSpacing(15)
        main_layout.setContentsMargins(20, 20, 20, 20)
        
        

        # replace header with blobify logo icon-name.png

        header = QLabel()
        header.setAlignment(Qt.AlignCenter)
        imgpath = resource_path('icon-name.png')
        header.setPixmap(QIcon(imgpath).pixmap(100, 100))
        # make the path relative to the current file 
        

        header.setStyleSheet("""

            QLabel {

                background-color: transparent;
                padding: 10px;
                font-size: 24px;
                font-weight: bold;
            }
        """)
        main_layout.addWidget(header)
        
        
        
        mode_group = QGroupBox("Mode")
        mode_group.setStyleSheet("QGroupBox { font-weight: bold; font-size: 11px; }")
        mode_layout = QHBoxLayout()
        
        self.encrypt_radio = QRadioButton("Encrypt")
        self.decrypt_radio = QRadioButton("Decrypt")
        self.encrypt_radio.setChecked(True)
        self.encrypt_radio.toggled.connect(lambda: self.set_mode("encrypt"))
        self.decrypt_radio.toggled.connect(lambda: self.set_mode("decrypt"))
        
        mode_layout.addWidget(self.encrypt_radio)
        mode_layout.addWidget(self.decrypt_radio)
        mode_layout.addStretch()
        mode_group.setLayout(mode_layout)
        main_layout.addWidget(mode_group)
        
        target_group = QGroupBox("Target")
        target_group.setStyleSheet("QGroupBox { font-weight: bold; font-size: 11px; }")
        target_layout = QHBoxLayout()
        
        self.folder_radio = QRadioButton("Folder (recursive)")
        self.file_radio = QRadioButton("Single file")
        self.folder_radio.setChecked(True)
        self.folder_radio.toggled.connect(lambda: self.set_target("folder"))
        self.file_radio.toggled.connect(lambda: self.set_target("file"))
        
        target_layout.addWidget(self.folder_radio)
        target_layout.addWidget(self.file_radio)
        target_layout.addStretch()
        target_group.setLayout(target_layout)
        main_layout.addWidget(target_group)
        
        path_group = QGroupBox("Select Input")
        path_group.setStyleSheet("QGroupBox { font-weight: bold; font-size: 11px; }")
        path_layout = QHBoxLayout()
        
        self.path_input = QLineEdit()
        self.path_input.setReadOnly(True)
        self.path_input.setPlaceholderText("No file/folder selected")
        
        browse_btn = QPushButton("Browse")
        browse_btn.clicked.connect(self.browse_path)
        browse_btn.setStyleSheet("""
            QPushButton {
                background-color: #3498db;
                color: white;
                border: none;
                padding: 8px 20px;
                font-weight: bold;
                border-radius: 3px;
            }
            QPushButton:hover {
                background-color: #2980b9;
            }
        """)
        
        path_layout.addWidget(self.path_input)
        path_layout.addWidget(browse_btn)
        path_group.setLayout(path_layout)
        main_layout.addWidget(path_group)
        
        output_group = QGroupBox("Output Folder")
        output_group.setStyleSheet("QGroupBox { font-weight: bold; font-size: 11px; }")
        output_layout = QVBoxLayout()
        
        output_path_layout = QHBoxLayout()
        self.output_input = QLineEdit()
        self.output_input.setReadOnly(True)
        self.output_input.setText(self.output_base)
        
        output_browse_btn = QPushButton("Change")
        output_browse_btn.clicked.connect(self.browse_output)
        output_browse_btn.setStyleSheet("""
            QPushButton {
                background-color: gray;
                color: white;
                border: none;
                padding: 8px 20px;
                font-weight: bold;
                border-radius: 3px;
            }
            QPushButton:hover {
                background-color: #8e44ad;
            }
        """)
        
        output_reset_btn = QPushButton("Reset")
        output_reset_btn.clicked.connect(self.reset_output)
        output_reset_btn.setStyleSheet("""
            QPushButton {
                background-color: #95a5a6;
                color: white;
                border: none;
                padding: 8px 15px;
                font-weight: bold;
                border-radius: 3px;
            }
            QPushButton:hover {
                background-color: #7f8c8d;
            }
        """)
        
        open_output_btn = QPushButton("Open Output")
        open_output_btn.clicked.connect(self.open_output_folder)
        open_output_btn.setStyleSheet("""
            QPushButton {
                background-color: #16a085;
                color: white;
                border: none;
                padding: 8px 15px;
                font-weight: bold;
                border-radius: 3px;
            }
            QPushButton:hover {
                background-color: #138d75;
            }
        """)
        
        output_path_layout.addWidget(self.output_input)
        output_path_layout.addWidget(output_browse_btn)
        output_path_layout.addWidget(output_reset_btn)
        output_path_layout.addWidget(open_output_btn)
        
        output_info = QLabel("Files will be saved in 'encrypted_output' or 'decrypted_output' inside this folder")
        output_info.setWordWrap(True)
        output_info.setStyleSheet("color: #7f8c8d; font-size: 9px; padding: 5px;")
        
        output_layout.addLayout(output_path_layout)
        output_layout.addWidget(output_info)
        output_group.setLayout(output_layout)
        main_layout.addWidget(output_group)
        
        pwd_group = QGroupBox("Password")
        pwd_group.setStyleSheet("QGroupBox { font-weight: bold; font-size: 11px; }")
        pwd_layout = QVBoxLayout()
        
        self.password_input = QLineEdit()
        self.password_input.setEchoMode(QLineEdit.Password)
        self.password_input.setPlaceholderText("Enter password")
        
        pwd_layout.addWidget(self.password_input)
        pwd_group.setLayout(pwd_layout)
        main_layout.addWidget(pwd_group)
        
        self.progress_bar = QProgressBar()
        self.progress_bar.setRange(0, 0)
        self.progress_bar.setVisible(False)
        main_layout.addWidget(self.progress_bar)
        
        self.status_label = QLabel("Ready")
        self.status_label.setAlignment(Qt.AlignCenter)
        self.status_label.setStyleSheet("color: #7f8c8d; font-size: 10px;")
        main_layout.addWidget(self.status_label)
        
        execute_btn = QPushButton("EXECUTE")
        execute_btn.clicked.connect(self.execute)
        execute_btn.setStyleSheet("""
            QPushButton {
                background-color: #27ae60;
                color: white;
                border: none;
                padding: 15px;
                font-size: 14px;
                font-weight: bold;
                border-radius: 5px;
            }
            QPushButton:hover {
                background-color: #229954;
            }
            QPushButton:disabled {
                background-color: #95a5a6;
            }
        """)
        main_layout.addWidget(execute_btn)
        
        main_layout.addStretch()
    
    def load_icon(self):
        """Carica l'icona dell'applicazione"""
        # Cerca l'icona in vari percorsi possibili
        base_path = os.path.dirname(os.path.abspath(__file__))
        
        # Se compilato con PyInstaller, usa sys._MEIPASS
        if getattr(sys, 'frozen', False):
            base_path = sys._MEIPASS
        
        
        icon_path = resource_path("icon.png")
        if os.path.exists(icon_path):
            try:
                self.setWindowIcon(QIcon(icon_path))
                return
            except Exception as e:
                print(f"Errore caricamento icona {icon_path}: {e}")
    
    def open_output_folder(self):
        output_folder = os.path.join(self.output_base, 
                                     "encrypted_output" if self.mode == "encrypt" else "decrypted_output")
        
        if not os.path.exists(output_folder):
            output_folder = self.output_base
            if not os.path.exists(output_folder):
                QMessageBox.information(self, "Info", "Output folder doesn't exist yet. Run an operation first.")
                return
        
        if platform.system() == 'Windows':
            os.startfile(output_folder)
        elif platform.system() == 'Darwin':
            subprocess.Popen(['open', output_folder])
        else:
            subprocess.Popen(['xdg-open', output_folder])
    
    def browse_output(self):
        path = QFileDialog.getExistingDirectory(self, "Select output folder")
        if path:
            self.output_base = path
            self.output_input.setText(path)
    
    def reset_output(self):
        self.output_base = os.path.dirname(os.path.abspath(__file__))
        self.output_input.setText(self.output_base)
    
    def set_mode(self, mode : str):
        self.mode = mode
    
    def set_target(self, target):
        self.target_type = target
        self.selected_path = ""
        self.path_input.clear()
    
    def browse_path(self):
        if self.target_type == "folder":
            path = QFileDialog.getExistingDirectory(self, "Select folder")
        else:
            if self.mode == "encrypt":
                path, _ = QFileDialog.getOpenFileName(
                    self, "Select file to encrypt", "", "All files (*.*)"
                )
            else:
                path, _ = QFileDialog.getOpenFileName(
                    self, "Select encrypted PNG", "", "PNG files (*.png)"
                )
        
        if path:
            self.selected_path = path
            self.path_input.setText(path)
    
    def execute(self):
        if not self.selected_path:
            QMessageBox.critical(self, "Error", "Select a file or folder!")
            return
        
        if not self.password_input.text():
            QMessageBox.critical(self, "Error", "Enter a password!")
            return
        
        if self.mode == "encrypt":
            output_folder = os.path.join(self.output_base, "encrypted_output")
        else:
            output_folder = os.path.join(self.output_base, "decrypted_output")
        
        if os.path.exists(output_folder) and os.listdir(output_folder):
            reply = QMessageBox.question(
                self, 
                "Warning", 
                f"Output folder will be deleted and recreated:\n{output_folder}\n\nContinue?",
                QMessageBox.Yes | QMessageBox.No,
                QMessageBox.No
            )
            
            if reply == QMessageBox.No:
                return
        
        self.progress_bar.setVisible(True)
        self.status_label.setText("Processing...")
        self.status_label.setStyleSheet("color: #e67e22; font-size: 10px;")
        
        self.worker = WorkerThread(
            self.mode, self.target_type, 
            self.selected_path, self.password_input.text(),
            self.output_base
        )
        self.worker.finished.connect(self.on_finished)
        self.worker.progress.connect(self.on_progress)
        self.worker.start()
    
    def on_progress(self, message : str):
        self.status_label.setText(message)
    
    def on_finished(self, success : bool, message : str):
        self.progress_bar.setVisible(False)
        
        if success:
            QMessageBox.information(self, "Success", message)
            self.status_label.setText("Completed!")
            self.status_label.setStyleSheet("color: #27ae60; font-size: 10px;")
        else:
            QMessageBox.critical(self, "Error", message)
            self.status_label.setText("Error!")
            self.status_label.setStyleSheet("color: #e74c3c; font-size: 10px;")


if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setStyle('Fusion')
    
    window = ImageEncryptorApp()
    window.show()
    
    sys.exit(app.exec_())