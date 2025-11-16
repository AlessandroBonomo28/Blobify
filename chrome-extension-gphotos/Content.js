// Usa un Set per tracciare elementi già processati
const elementiProcessati = new WeakSet();

// ========== CACHE POOL ==========
class CachePool {
  constructor(maxSize = 15) {
    this.maxSize = maxSize;
    this.cache = new Map();
    this.objectUrls = new Map();
  }

  get(key) {
    return this.cache.get(key) || null;
  }

  set(key, value) {
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      this.remove(firstKey);
    }

    if (!this.cache.has(key)) {
      this.cache.set(key, { ...value, refs: 0 });
    }
  }

  getObjectUrl(blob) {
    if (this.objectUrls.has(blob)) {
      return this.objectUrls.get(blob);
    }
    
    const url = URL.createObjectURL(blob);
    this.objectUrls.set(blob, url);
    return url;
  }

  addRef(key) {
    const entry = this.cache.get(key);
    if (entry) entry.refs++;
  }

  releaseRef(key) {
    const entry = this.cache.get(key);
    if (entry) entry.refs = Math.max(0, entry.refs - 1);
  }

  remove(key) {
    const entry = this.cache.get(key);
    if (entry) {
      const objectUrl = this.objectUrls.get(entry.blob);
      if (objectUrl && entry.refs === 0) {
        URL.revokeObjectURL(objectUrl);
        this.objectUrls.delete(entry.blob);
      }
      this.cache.delete(key);
    }
  }

  has(key) {
    return this.cache.has(key);
  }

  size() {
    return this.cache.size;
  }

  cleanup() {
    let cleaned = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (entry.refs === 0) {
        this.remove(key);
        cleaned++;
      }
    }
    return cleaned;
  }
}

const decryptCache = new CachePool(15);
const elementData = new WeakMap();


// ========== FUNZIONI CRITTOGRAFICHE ==========

async function getPassword() {
  return new Promise((resolve) => {
    chrome.storage.local.get("decryptPassword", (data) => {
      resolve(data.decryptPassword || "123"); // default fallback
    });
  });
}
async function decryptData(encryptedData, password) {
  const salt = encryptedData.slice(0, 16);
  const nonce = encryptedData.slice(16, 32);
  const tag = encryptedData.slice(32, 48);
  const ciphertext = encryptedData.slice(48);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 200000,
      hash: "SHA-1"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const dataToDecrypt = new Uint8Array(ciphertext.length + tag.length);
  dataToDecrypt.set(ciphertext, 0);
  dataToDecrypt.set(tag, ciphertext.length);

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      dataToDecrypt
    );
    return new Uint8Array(decrypted);
  } catch (err) {
    console.error(" Errore decifratura:", err);
    return null;
  }
}

function extractBackgroundImageUrl(element) {
  const style = window.getComputedStyle(element);
  const bgImage = style.backgroundImage;
  
  if (!bgImage || bgImage === 'none') return null;
  
  const match = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
  return match ? match[1] : null;
}

async function extractDataFromImageUrl(imageUrl) {
  try {
    // =s0 qualita massima
    // =d download
    // =w specifica larghezza
    if (imageUrl.includes('=s')) {
      const indexofS = imageUrl.indexOf('=s');
      imageUrl = imageUrl.substring(0, indexofS) + '=s0?authuser=0';
    }

    if (imageUrl.includes('=w')) {
      const indexofW = imageUrl.indexOf('=w');
      imageUrl = imageUrl.substring(0, indexofW) + '=s0?authuser=0';
    }
    console.log(` Extracting data from: ${imageUrl}`);
    if (!imageUrl.includes('/pw/')) return null;

    const response = await fetch(imageUrl, {
      credentials: 'include',
      mode: 'cors'
    });

    if (!response.ok) {
      console.error(` Fetch failed for: ${imageUrl}`);
      return null;
    }
    const blob = await response.blob();
    const img = await createImageBitmap(blob);

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    
    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    const pixels = imageData.data;

    // Estrai solo il canale rosso (grayscale)
    const grayPixels = new Uint8Array(pixels.length / 4);
    for (let i = 0, j = 0; i < pixels.length; i += 4, j++) {
      grayPixels[j] = pixels[i];
    }

    // I pixel grezzi rappresentano una stringa Base64 codificata come bytes
    // Convertiamo i bytes in stringa ASCII
    const base64String = new TextDecoder('ascii').decode(grayPixels);
    
    // Rimuovi caratteri null e spazi
    const cleanBase64 = base64String.replace(/\0/g, '').trim();
    
    // Decodifica la stringa Base64 in bytes
    const binaryString = atob(cleanBase64);
    const decodedBytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      decodedBytes[i] = binaryString.charCodeAt(i);
    }

    return decodedBytes;
  } catch (e) {
    console.error(' Error extracting data:', e);
    return null;
  }
}

function normalizeUrl(url) {
  return url.split('?')[0];
}

async function decryptAndShowBackground(divElement, imageUrl, password = "123") {
  try {
    const cacheKey = normalizeUrl(imageUrl);
    let blob, mimeType, ext;
    
    if (decryptCache.has(cacheKey)) {
      const cached = decryptCache.get(cacheKey);
      blob = cached.blob;
      mimeType = cached.mimeType;
      ext = cached.ext;
    } else {
      const encryptedData = await extractDataFromImageUrl(imageUrl);
      if (!encryptedData) return false;
      
      const decryptedData = await decryptData(encryptedData, password);
      if (!decryptedData) return false;
      
      const extLen = decryptedData[0];
      ext = new TextDecoder().decode(decryptedData.slice(1, 1 + extLen));
      const fileBytes = decryptedData.slice(1 + extLen);
      
      mimeType = 'image/jpeg';
      if (ext === '.png') mimeType = 'image/png';
      else if (ext === '.gif') mimeType = 'image/gif';
      else if (ext === '.webp') mimeType = 'image/webp';
      else if (ext === '.bmp') mimeType = 'image/bmp';
      
      blob = new Blob([fileBytes], { type: mimeType });
      decryptCache.set(cacheKey, { blob, mimeType, ext });
    }
    
    decryptCache.addRef(cacheKey);
    
    const img = await createImageBitmap(blob);
    const divRect = divElement.getBoundingClientRect();
    
    const scaleX = divRect.width / img.width;
    const scaleY = divRect.height / img.height;
    const scale = Math.min(scaleX, scaleY);
    
    const newWidth = Math.round(img.width * scale);
    const newHeight = Math.round(img.height * scale);
    
    const canvas = document.createElement('canvas');
    canvas.width = newWidth;
    canvas.height = newHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, newWidth, newHeight);
    
    const resizedBlob = await new Promise(resolve => {
      canvas.toBlob(resolve, mimeType, 0.95);
    });
    
    const resizedUrl = URL.createObjectURL(resizedBlob);
    
    const oldData = elementData.get(divElement);
    if (oldData) decryptCache.releaseRef(oldData.cacheKey);
    
    elementData.set(divElement, { cacheKey, isImg: false, resizedUrl });
    
    divElement.style.backgroundImage = `url("${resizedUrl}")`;
    divElement.style.backgroundSize = 'contain';
    divElement.style.backgroundRepeat = 'no-repeat';
    divElement.style.backgroundPosition = 'center';
    
    return true;
  } catch (e) {
    return false;
  }
}

function resizeParentContainers(imgElement, originalWidth, originalHeight) {
  let mainContainer = imgElement.closest('.XXKL8c');
  if (!mainContainer) return;
  
  const currentStyle = window.getComputedStyle(mainContainer);
  const currentWidth = parseFloat(currentStyle.width);
  const currentHeight = parseFloat(currentStyle.height);
  
  const aspectRatio = originalWidth / originalHeight;
  let newWidth, newHeight;
  
  if (aspectRatio > 1) {
    newWidth = currentWidth;
    newHeight = currentWidth / aspectRatio;
  } else {
    newHeight = currentHeight;
    newWidth = currentHeight * aspectRatio;
  }
  
  const currentTop = parseFloat(currentStyle.top);
  const currentLeft = parseFloat(currentStyle.left);
  const deltaWidth = currentWidth - newWidth;
  const deltaHeight = currentHeight - newHeight;
  
  mainContainer.style.width = `${newWidth}px`;
  mainContainer.style.height = `${newHeight}px`;
  mainContainer.style.top = `${currentTop + deltaHeight / 2}px`;
  mainContainer.style.left = `${currentLeft + deltaWidth / 2}px`;
  
  const intermediateContainers = mainContainer.querySelectorAll('.TTxCae, .yF8Bmb');
  intermediateContainers.forEach(container => {
    container.style.width = `${newWidth}px`;
    container.style.height = `${newHeight}px`;
  });
}

async function decryptAndShowImg(imgElement, imageUrl, password = "123") {
  console.log(`!! Decrypting and showing: ${imageUrl}`);
  try {
    const cacheKey = normalizeUrl(imageUrl);
    let blob, mimeType, ext, imgWidth, imgHeight;
    
    if (decryptCache.has(cacheKey)) {
      console.log(`Cache hit for: ${cacheKey}`);
      const cached = decryptCache.get(cacheKey);
      blob = cached.blob;
      mimeType = cached.mimeType;
      ext = cached.ext;
      
      const img = await createImageBitmap(blob);
      imgWidth = img.width;
      imgHeight = img.height;
    } else {
      const encryptedData = await extractDataFromImageUrl(imageUrl);
      if (!encryptedData) {
        console.error(` No encrypted data found for: ${imageUrl}`);
        return false;
      }
      const decryptedData = await decryptData(encryptedData, password);
      if (!decryptedData) {
        console.error(` Decryption failed for: ${imageUrl}`);
        return false;
      }
      const extLen = decryptedData[0];
      ext = new TextDecoder().decode(decryptedData.slice(1, 1 + extLen));
      const fileBytes = decryptedData.slice(1 + extLen);
      
      mimeType = 'image/jpeg';
      if (ext === '.png') mimeType = 'image/png';
      else if (ext === '.gif') mimeType = 'image/gif';
      else if (ext === '.webp') mimeType = 'image/webp';
      else if (ext === '.bmp') mimeType = 'image/bmp';
      
      blob = new Blob([fileBytes], { type: mimeType });
      
      const img = await createImageBitmap(blob);
      imgWidth = img.width;
      imgHeight = img.height;
      
      decryptCache.set(cacheKey, { blob, mimeType, ext });
    }
    
    decryptCache.addRef(cacheKey);
    
    const url = decryptCache.getObjectUrl(blob);
    
    const oldData = elementData.get(imgElement);
    if (oldData) decryptCache.releaseRef(oldData.cacheKey);
    
    elementData.set(imgElement, { cacheKey, isImg: true });
    
    imgElement.src = url;
    resizeParentContainers(imgElement, imgWidth, imgHeight);
    
    const mainContainer = imgElement.closest('.XXKL8c');
    if (mainContainer) {
      const containerStyle = window.getComputedStyle(mainContainer);
      imgElement.width = parseFloat(containerStyle.width);
      imgElement.height = parseFloat(containerStyle.height);
    } else {
      imgElement.width = imgWidth;
      imgElement.height = imgHeight;
    }
    
    return true;
  } catch (e) {
    // log error

    console.error(` Errore durante la decriptazione dell'immagine: ${e}`);
    return false;
  }
}

// ========== SCANSIONE ==========

let isScanning = false;

async function scanAndDecrypt() {
  if (isScanning) return;
  console.log(" Scansione in corso...") ;
  isScanning = true;
  
  
  const allElements = Array.from(document.querySelectorAll('div.RY3tic, div.BiCYpc, img.RY3tic, img.BiCYpc'));
  
  let contatore = 0;
  const globalPassword = await getPassword();
  for (let element of allElements) {
    //if (elementiProcessati.has(element)) continue;
    
    if (element.tagName === 'IMG' && element.src) {
      if (!element.src.includes('/pw/')) {
        elementiProcessati.add(element);
        continue;
      }
      
      await decryptAndShowImg(element, element.src, globalPassword);
      elementiProcessati.add(element);
      contatore++;
      continue;
    }
    
    const bgUrl = extractBackgroundImageUrl(element);
    if (bgUrl) {
      await decryptAndShowBackground(element, bgUrl, globalPassword);
      elementiProcessati.add(element);
      contatore++;
      continue;
    }
    
    elementiProcessati.add(element);
  }
  
  if (contatore > 0) {
    console.log(` Decriptati ${contatore} elementi`);
  }
  
  isScanning = false;
}

// ========== URL CHANGE DETECTION ==========

let lastUrl = location.href;

function checkUrlChange() {
  const currentUrl = location.href;
  
  if (currentUrl !== lastUrl) {
    console.log(` URL cambiato: ${currentUrl.substring(currentUrl.lastIndexOf('/'))}`);
    lastUrl = currentUrl;
    
    // Delay per permettere al DOM di aggiornarsi
    setTimeout(() => {
      scanAndDecrypt();
    }, 500);
  }
}

// Controlla URL ogni 300ms
setInterval(checkUrlChange, 100);

// Intercetta eventi di navigazione browser
window.addEventListener('popstate', () => {
  console.log(' Navigazione browser');
  setTimeout(scanAndDecrypt, 100);
});

// Intercetta pushState e replaceState
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function(...args) {
  originalPushState.apply(this, args);
  setTimeout(scanAndDecrypt, 100);
};

history.replaceState = function(...args) {
  originalReplaceState.apply(this, args);
  setTimeout(scanAndDecrypt, 100);
};

// ========== CLEANUP ==========

function cleanupOrphanedElements() {
  const cacheCleaned = decryptCache.cleanup();
  if (cacheCleaned > 0) {
    console.log(` Puliti ${cacheCleaned} blob dalla cache`);
  }
}

// ========== INIZIALIZZAZIONE ==========

console.log(" Estensione Decrypt attiva! Password: 123");
console.log(" URL change detection attiva");
console.log(" Cache Pool: max 15 immagini");



// Scansione periodica ogni 2 secondi
setInterval(scanAndDecrypt, 500);

// Cleanup ogni 30 secondi
setInterval(cleanupOrphanedElements, 5000);




// ZOOM---------
// ========== ZOOM SYSTEM ==========

class ImageZoom {
  constructor() {
    this.zoomLevel = 1;
    this.minZoom = 1;
    this.maxZoom = 5;
    this.zoomStep = 0.3;
    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;
    this.translateX = 0;
    this.translateY = 0;
    this.currentImg = null;
    
    this.initOverlay();
    this.attachGlobalListeners();
  }
  
  initOverlay() {
    // Crea overlay per zoom fullscreen
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.95);
      z-index: 999999;
      display: none;
      justify-content: center;
      align-items: center;
      cursor: grab;
    `;
    
    this.zoomContainer = document.createElement('div');
    this.zoomContainer.style.cssText = `
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: hidden;
    `;
    
    this.zoomImg = document.createElement('img');
    this.zoomImg.style.cssText = `
      max-width: 90vw;
      max-height: 90vh;
      object-fit: contain;
      transform-origin: center center;
      transition: transform 0.1s ease-out;
      user-select: none;
      -webkit-user-drag: none;
    `;
    
    // Indicatore zoom
    this.zoomIndicator = document.createElement('div');
    this.zoomIndicator.style.cssText = `
      position: absolute;
      top: 20px;
      right: 20px;
      background: rgba(255, 255, 255, 0.9);
      color: #000;
      padding: 10px 20px;
      border-radius: 8px;
      font-family: Arial, sans-serif;
      font-size: 16px;
      font-weight: bold;
      pointer-events: none;
      z-index: 1000000;
    `;
    
    // Pulsante chiudi
    this.closeBtn = document.createElement('button');
    this.closeBtn.innerHTML = '✕';
    this.closeBtn.style.cssText = `
      position: absolute;
      top: 20px;
      left: 20px;
      background: rgba(255, 255, 255, 0.9);
      border: none;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      font-size: 24px;
      cursor: pointer;
      z-index: 1000000;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    `;
    
    this.closeBtn.addEventListener('mouseenter', () => {
      this.closeBtn.style.background = 'rgba(255, 255, 255, 1)';
    });
    
    this.closeBtn.addEventListener('mouseleave', () => {
      this.closeBtn.style.background = 'rgba(255, 255, 255, 0.9)';
    });
    
    this.closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeZoom();
    });
    
    this.zoomContainer.appendChild(this.zoomImg);
    this.overlay.appendChild(this.zoomContainer);
    this.overlay.appendChild(this.zoomIndicator);
    this.overlay.appendChild(this.closeBtn);
    document.body.appendChild(this.overlay);
    
    // Event listeners per zoom overlay
    this.overlay.addEventListener('wheel', (e) => this.handleWheel(e));
    this.overlay.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.overlay.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.overlay.addEventListener('mouseup', () => this.handleMouseUp());
    this.overlay.addEventListener('mouseleave', () => this.handleMouseUp());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.closeZoom();
    });
    
    // Touch support
    this.overlay.addEventListener('touchstart', (e) => this.handleTouchStart(e));
    this.overlay.addEventListener('touchmove', (e) => this.handleTouchMove(e));
    this.overlay.addEventListener('touchend', () => this.handleMouseUp());
  }
  
  attachGlobalListeners() {
    // Intercetta click sulle immagini decriptate
    document.addEventListener('click', (e) => {
      const img = e.target.closest('img.RY3tic, img.BiCYpc');
      if (img && img.src && img.src.startsWith('blob:')) {
        e.preventDefault();
        e.stopPropagation();
        this.openZoom(img);
      }
    }, true);
  }
  
  openZoom(imgElement) {
    this.currentImg = imgElement;
    this.zoomImg.src = imgElement.src;
    this.zoomLevel = 1;
    this.translateX = 0;
    this.translateY = 0;
    this.overlay.style.display = 'flex';
    this.updateTransform();
    this.updateIndicator();
    
    // Blocca scroll della pagina
    document.body.style.overflow = 'hidden';
  }
  
  closeZoom() {
    this.overlay.style.display = 'none';
    this.currentImg = null;
    document.body.style.overflow = '';
  }
  
  handleWheel(e) {
    e.preventDefault();
    
    const rect = this.zoomImg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const oldZoom = this.zoomLevel;
    
    if (e.deltaY < 0) {
      this.zoomLevel = Math.min(this.maxZoom, this.zoomLevel + this.zoomStep);
    } else {
      this.zoomLevel = Math.max(this.minZoom, this.zoomLevel - this.zoomStep);
    }
    
    // Reset posizione se torniamo a zoom 1
    if (this.zoomLevel === 1) {
      this.translateX = 0;
      this.translateY = 0;
    } else {
      // Calcola zoom verso il punto del mouse
      const zoomRatio = this.zoomLevel / oldZoom;
      this.translateX = mouseX - (mouseX - this.translateX) * zoomRatio;
      this.translateY = mouseY - (mouseY - this.translateY) * zoomRatio;
    }
    
    this.updateTransform();
    this.updateIndicator();
  }
  
  handleMouseDown(e) {
    if (e.target !== this.zoomImg) return;
    if (this.zoomLevel === 1) return;
    
    this.isDragging = true;
    this.startX = e.clientX - this.translateX;
    this.startY = e.clientY - this.translateY;
    this.overlay.style.cursor = 'grabbing';
    this.zoomImg.style.transition = 'none';
  }
  
  handleMouseMove(e) {
    if (!this.isDragging) return;
    
    this.translateX = e.clientX - this.startX;
    this.translateY = e.clientY - this.startY;
    this.updateTransform();
  }
  
  handleMouseUp() {
    this.isDragging = false;
    this.overlay.style.cursor = 'grab';
    this.zoomImg.style.transition = 'transform 0.1s ease-out';
  }
  
  handleTouchStart(e) {
    if (e.touches.length === 1 && this.zoomLevel > 1) {
      const touch = e.touches[0];
      this.isDragging = true;
      this.startX = touch.clientX - this.translateX;
      this.startY = touch.clientY - this.translateY;
    }
  }
  
  handleTouchMove(e) {
    if (this.isDragging && e.touches.length === 1) {
      e.preventDefault();
      const touch = e.touches[0];
      this.translateX = touch.clientX - this.startX;
      this.translateY = touch.clientY - this.startY;
      this.updateTransform();
    }
  }
  
  updateTransform() {
    const transform = this.zoomLevel === 1 
      ? 'scale(1)' 
      : `scale(${this.zoomLevel}) translate(${this.translateX / this.zoomLevel}px, ${this.translateY / this.zoomLevel}px)`;
    this.zoomImg.style.transform = transform;
  }
  
  updateIndicator() {
    this.zoomIndicator.textContent = `${Math.round(this.zoomLevel * 100)}%`;
  }
}

// Inizializza il sistema di zoom
const imageZoom = new ImageZoom();

console.log(' Image Zoom System attivo! fai Click su immagini decriptate per zoomare');
