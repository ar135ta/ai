/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, Modality } from '@google/genai';

// App state
let activeTab: 'generate' | 'background' | 'restore' = 'generate';
let uploadedFiles: { file: File; base64: string; id: string }[] = [];
let originalImage: { file: File; base64: string; id: string } | null = null;
let backgroundImage: { file: File; base64: string; id: string } | null = null;
let restorationImage: { file: File; base64: string; id: string } | null = null;
let isLoading = false;
let lastGeneratedImageUrl: string | null = null;

// DOM Element references
// These will be re-assigned when tabs are switched
let imageUploadEl: HTMLElement | null;
let imagePreviewEl: HTMLElement | null;
let promptInputEl: HTMLTextAreaElement | null;
let generateBtnEl: HTMLButtonElement | null;
let fileInputEl: HTMLInputElement | null;
let analyzeBtnEl: HTMLButtonElement | null;
let aspectRatioEl: HTMLSelectElement | null;
let clearPromptBtnEl: HTMLButtonElement | null;
let keepFaceCheckboxEl: HTMLInputElement | null;
let keepFaceSectionEl: HTMLElement | null;

// Common elements
let outputEl: HTMLElement;
let zoomModalEl: HTMLElement;
let zoomedImgEl: HTMLImageElement;
let modalCloseBtnEl: HTMLElement;
let tabContentEl: HTMLElement;


/**
 * Initializes the application, sets up the DOM, and attaches event listeners.
 */
function App() {
    document.body.innerHTML = `
        <main>
            <div class="column column-left">
                <div class="input-section">
                    <div class="header-section">
                        <h1>AI PHOTO GENERATOR</h1>
                        <p>Contact: 0939 21 23 27 - Café: VCB 0111000750523</p>
                        <p>Premium Version: https://product-image-673592451306.us-west1.run.app</p>
                    </div>
                    <div class="tabs">
                        <button id="tab-generate" class="tab-button active" data-tab="generate">Tạo ảnh AI</button>
                        <button id="tab-background" class="tab-button" data-tab="background">Thay nền ảnh</button>
                        <button id="tab-restore" class="tab-button" data-tab="restore">Phục hồi ảnh cũ</button>
                    </div>
                    <div id="tab-content"></div>
                </div>
            </div>
            <div class="column column-right">
                <section id="output" class="output-section" aria-live="polite">
                    <div class="placeholder">
                        <p>Ảnh của bạn sẽ xuất hiện ở đây.</p>
                    </div>
                </section>
            </div>
        </main>
        <div id="zoom-modal" class="modal">
            <span id="modal-close-btn" class="modal-close" aria-label="Đóng chế độ xem phóng to">&times;</span>
            <img class="modal-content" id="zoomed-img" alt="Ảnh đã phóng to">
        </div>
    `;

    // Get references to common DOM elements
    outputEl = document.getElementById('output')!;
    zoomModalEl = document.getElementById('zoom-modal')!;
    zoomedImgEl = document.getElementById('zoomed-img') as HTMLImageElement;
    modalCloseBtnEl = document.getElementById('modal-close-btn')!;
    tabContentEl = document.getElementById('tab-content')!;

    // Tab switching logic
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', (e) => {
            const target = e.currentTarget as HTMLButtonElement;
            const tabName = target.dataset.tab as 'generate' | 'background' | 'restore';
            if (tabName !== activeTab) {
                activeTab = tabName;
                document.querySelector('.tab-button.active')?.classList.remove('active');
                target.classList.add('active');
                renderActiveTab();
            }
        });
    });

    // Modal listeners
    modalCloseBtnEl.addEventListener('click', closeZoomModal);
    zoomModalEl.addEventListener('click', (event) => {
        if (event.target === zoomModalEl) {
            closeZoomModal();
        }
    });

    renderActiveTab(); // Render the initial active tab
}


/**
 * Renders the UI for the currently active tab.
 */
function renderActiveTab() {
    if (activeTab === 'generate') {
        renderGeneratorUI();
    } else if (activeTab === 'background') {
        renderBackgroundChangerUI();
    } else {
        renderRestorationUI();
    }
}

/**
 * Renders the UI for the AI Image Generator tab.
 */
function renderGeneratorUI() {
    tabContentEl.innerHTML = `
        <div id="image-upload" class="drop-zone" role="button" tabindex="0" aria-label="Vùng tải ảnh lên">
            <p>Kéo và thả ảnh vào đây, hoặc nhấn để chọn tệp</p>
            <input type="file" id="file-input" accept="image/*" multiple hidden>
        </div>
        <div id="image-preview" class="preview-container" aria-live="polite"></div>
        
        <div class="prompt-header">
            <label id="prompt-input-label" for="prompt-input">Mô tả</label>
            <div class="prompt-buttons">
                <button id="clear-prompt-btn" aria-label="Xóa mô tả">Xóa</button>
                <button id="analyze-btn">Phân tích ảnh</button>
            </div>
        </div>
        <textarea id="prompt-input" placeholder="Ví dụ: Một chú mèo oai vệ đội mũ dự tiệc" aria-labelledby="prompt-input-label"></textarea>
        
        <div id="keep-face-section" class="checkbox-section hidden">
            <input type="checkbox" id="keep-face-checkbox">
            <label for="keep-face-checkbox">Giữ khuôn mặt</label>
        </div>

        <div class="aspect-ratio-section">
            <label for="aspect-ratio">Tỷ lệ khung hình (cho ảnh mới)</label>
            <select id="aspect-ratio">
                <option value="1:1">Vuông (1:1)</option>
                <option value="3:4" selected>Dọc (3:4)</option>
                <option value="4:3">Ngang (4:3)</option>
                <option value="9:16">Cao (9:16)</option>
                <option value="16:9">Rộng (16:9)</option>
            </select>
        </div>

        <button id="generate-btn" disabled>Tạo ảnh</button>
    `;

    // Get references to DOM elements for this tab
    imageUploadEl = document.getElementById('image-upload')!;
    imagePreviewEl = document.getElementById('image-preview')!;
    promptInputEl = document.getElementById('prompt-input') as HTMLTextAreaElement;
    generateBtnEl = document.getElementById('generate-btn') as HTMLButtonElement;
    fileInputEl = document.getElementById('file-input') as HTMLInputElement;
    analyzeBtnEl = document.getElementById('analyze-btn') as HTMLButtonElement;
    aspectRatioEl = document.getElementById('aspect-ratio') as HTMLSelectElement;
    clearPromptBtnEl = document.getElementById('clear-prompt-btn') as HTMLButtonElement;
    keepFaceCheckboxEl = document.getElementById('keep-face-checkbox') as HTMLInputElement;
    keepFaceSectionEl = document.getElementById('keep-face-section') as HTMLElement;

    // Attach event listeners for this tab
    imageUploadEl.addEventListener('click', () => fileInputEl!.click());
    fileInputEl.addEventListener('change', handleFileSelect);
    imageUploadEl.addEventListener('dragover', handleDragOver);
    imageUploadEl.addEventListener('dragleave', handleDragLeave);
    imageUploadEl.addEventListener('drop', handleDrop);
    promptInputEl.addEventListener('input', updateGenerateButtonState);
    generateBtnEl.addEventListener('click', handleGenerateClick);
    analyzeBtnEl.addEventListener('click', handleAnalyzeClick);
    clearPromptBtnEl.addEventListener('click', handleClearPromptClick);
    
    // Restore state
    renderImagePreviews();
    updateGenerateButtonState();
}

/**
 * Renders the UI for the Background Changer tab.
 */
function renderBackgroundChangerUI() {
    tabContentEl.innerHTML = `
        <div class="upload-group">
            <label>Ảnh gốc (để giữ lại chủ thể)</label>
            <div id="original-image-upload" class="drop-zone small" role="button" tabindex="0">
                <div id="original-image-preview" class="single-preview-container">
                    <p>Tải ảnh gốc</p>
                </div>
                <input type="file" id="original-file-input" accept="image/*" hidden>
            </div>
        </div>

        <div class="upload-group">
            <label>Ảnh nền (tùy chọn)</label>
            <div id="background-image-upload" class="drop-zone small" role="button" tabindex="0">
                 <div id="background-image-preview" class="single-preview-container">
                    <p>Tải ảnh nền</p>
                </div>
                <input type="file" id="background-file-input" accept="image/*" hidden>
            </div>
        </div>
        
        <div class="prompt-header">
            <label for="background-prompt-input">Mô tả nền (nếu không tải ảnh nền)</label>
            <div class="prompt-buttons">
                 <button id="generate-bg-prompt-btn">Tạo mô tả</button>
                 <div id="suggestion-wrapper" class="suggestion-wrapper hidden">
                    <input type="text" id="suggestion-input" placeholder="Gợi ý nền, ví dụ: trong rừng">
                    <button id="confirm-suggestion-btn" aria-label="Xác nhận gợi ý">✓</button>
                    <button id="cancel-suggestion-btn" aria-label="Hủy bỏ">✕</button>
                 </div>
            </div>
        </div>
        <textarea id="background-prompt-input" placeholder="Ví dụ: Một bãi biển nhiệt đới lúc hoàng hôn"></textarea>
        
        <button id="change-background-btn" disabled>Thay nền</button>
    `;

    // Get references and attach listeners
    const originalUploadEl = document.getElementById('original-image-upload')!;
    const originalFileInputEl = document.getElementById('original-file-input') as HTMLInputElement;
    const backgroundUploadEl = document.getElementById('background-image-upload')!;
    const backgroundFileInputEl = document.getElementById('background-file-input') as HTMLInputElement;
    const backgroundPromptInputEl = document.getElementById('background-prompt-input') as HTMLTextAreaElement;
    const generateBgPromptBtnEl = document.getElementById('generate-bg-prompt-btn') as HTMLButtonElement;
    const changeBackgroundBtnEl = document.getElementById('change-background-btn') as HTMLButtonElement;

    // Suggestion UI elements
    const suggestionWrapperEl = document.getElementById('suggestion-wrapper')!;
    const suggestionInputEl = document.getElementById('suggestion-input') as HTMLInputElement;
    const confirmSuggestionBtnEl = document.getElementById('confirm-suggestion-btn')!;
    const cancelSuggestionBtnEl = document.getElementById('cancel-suggestion-btn')!;

    originalUploadEl.addEventListener('click', () => originalFileInputEl.click());
    originalFileInputEl.addEventListener('change', (e) => handleSingleFile(e, 'original'));

    backgroundUploadEl.addEventListener('click', () => backgroundFileInputEl.click());
    backgroundFileInputEl.addEventListener('change', (e) => handleSingleFile(e, 'background'));
    
    [backgroundPromptInputEl, originalFileInputEl, backgroundFileInputEl].forEach(el => {
        el.addEventListener('input', updateChangeBackgroundBtnState);
        el.addEventListener('change', updateChangeBackgroundBtnState);
    });

    changeBackgroundBtnEl.addEventListener('click', handleChangeBackgroundClick);

    // Suggestion UI Listeners
    generateBgPromptBtnEl.addEventListener('click', () => {
        if (!originalImage) {
            alert("Vui lòng tải lên ảnh gốc trước.");
            return;
        }
        generateBgPromptBtnEl.classList.add('hidden');
        suggestionWrapperEl.classList.remove('hidden');
        suggestionInputEl.focus();
    });

    cancelSuggestionBtnEl.addEventListener('click', () => {
        suggestionWrapperEl.classList.add('hidden');
        generateBgPromptBtnEl.classList.remove('hidden');
        suggestionInputEl.value = '';
    });

    confirmSuggestionBtnEl.addEventListener('click', () => {
        handleGenerateBackgroundPromptClick(suggestionInputEl.value);
    });
    suggestionInputEl.addEventListener('keydown', (e) => {
        if(e.key === 'Enter') {
            handleGenerateBackgroundPromptClick(suggestionInputEl.value);
        }
    });

    // Restore state
    renderSingleImagePreview('original');
    renderSingleImagePreview('background');
    updateChangeBackgroundBtnState();
}

/**
 * Renders the UI for the Photo Restoration tab.
 */
function renderRestorationUI() {
    tabContentEl.innerHTML = `
        <div class="upload-group">
            <label>Tải ảnh cũ, hư hại</label>
            <div id="restoration-image-upload" class="drop-zone" role="button" tabindex="0">
                <div id="restoration-image-preview" class="single-preview-container large">
                    <p>Tải ảnh để phục hồi</p>
                </div>
                <input type="file" id="restoration-file-input" accept="image/*" hidden>
            </div>
        </div>

        <div class="options-grid">
             <div class="checkbox-section">
                <input type="checkbox" id="colorize-checkbox">
                <label for="colorize-checkbox">Tô màu</label>
            </div>
             <div class="checkbox-section">
                <input type="checkbox" id="face-rotate-checkbox">
                <label for="face-rotate-checkbox">Xoay mặt (chính diện)</label>
            </div>
        </div>

        <div class="outfit-section">
            <label for="outfit-select">Thay trang phục (tùy chọn)</label>
            <div class="outfit-controls">
                 <select id="outfit-select">
                    <option value="none">Không thay đổi</option>
                    <option value="Vest nam">Vest nam</option>
                    <option value="Vest nữ">Vest nữ</option>
                    <option value="Áo dài Việt Nam">Áo dài Việt Nam</option>
                    <option value="Áo sơ mi">Áo sơ mi</option>
                    <option value="custom">Khác (nhập bên dưới)</option>
                </select>
                <textarea id="custom-outfit-input" class="hidden" placeholder="Mô tả trang phục bạn muốn..."></textarea>
            </div>
        </div>
        
        <button id="restore-btn" disabled>Phục hồi ảnh</button>
    `;
    
    // Get references and attach listeners
    const restorationUploadEl = document.getElementById('restoration-image-upload')!;
    const restorationFileInputEl = document.getElementById('restoration-file-input') as HTMLInputElement;
    const restoreBtnEl = document.getElementById('restore-btn') as HTMLButtonElement;
    const outfitSelectEl = document.getElementById('outfit-select') as HTMLSelectElement;
    const customOutfitInputEl = document.getElementById('custom-outfit-input') as HTMLTextAreaElement;

    restorationUploadEl.addEventListener('click', () => restorationFileInputEl.click());
    restorationFileInputEl.addEventListener('change', (e) => handleSingleFile(e, 'restoration'));
    
    restoreBtnEl.addEventListener('click', handleRestoreClick);
    
    outfitSelectEl.addEventListener('change', () => {
        if (outfitSelectEl.value === 'custom') {
            customOutfitInputEl.classList.remove('hidden');
        } else {
            customOutfitInputEl.classList.add('hidden');
        }
    });

    // Restore state
    renderSingleImagePreview('restoration');
    updateRestoreButtonState();
}

/**
 * Handles single file upload for various tabs.
 */
async function handleSingleFile(event: Event, type: 'original' | 'background' | 'restoration') {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    const base64 = await fileToBase64(file);
    const id = `file-${Date.now()}`;
    const fileData = { file, base64, id };

    if (type === 'original') {
        originalImage = fileData;
    } else if (type === 'background') {
        backgroundImage = fileData;
    } else if (type === 'restoration') {
        restorationImage = fileData;
    }
    
    renderSingleImagePreview(type);
    
    if (type === 'original' || type === 'background') {
        updateChangeBackgroundBtnState();
    } else {
        updateRestoreButtonState();
    }
}


/**
 * Renders preview for single image upload zones.
 */
function renderSingleImagePreview(type: 'original' | 'background' | 'restoration') {
    const containerId = `${type}-image-preview`;
    const containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    let imageData;
    let placeholderText = '';
    switch (type) {
        case 'original':
            imageData = originalImage;
            placeholderText = 'Tải ảnh gốc';
            break;
        case 'background':
            imageData = backgroundImage;
            placeholderText = 'Tải ảnh nền';
            break;
        case 'restoration':
            imageData = restorationImage;
            placeholderText = 'Tải ảnh để phục hồi';
            break;
    }

    if (imageData) {
        containerEl.innerHTML = `
            <img src="${imageData.base64}" alt="${imageData.file.name}" class="single-preview-img"/>
            <button class="remove-btn" data-type="${type}" aria-label="Remove image">&times;</button>
        `;
        containerEl.querySelector('.remove-btn')?.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent parent drop-zone click event
            if (type === 'original') originalImage = null;
            else if (type === 'background') backgroundImage = null;
            else if (type === 'restoration') restorationImage = null;

            renderSingleImagePreview(type);
             if (type === 'original' || type === 'background') {
                updateChangeBackgroundBtnState();
            } else {
                updateRestoreButtonState();
            }
        });
    } else {
        containerEl.innerHTML = `<p>${placeholderText}</p>`;
    }
}


/**
 * Updates the state of the "Change Background" button.
 */
function updateChangeBackgroundBtnState() {
    const btn = document.getElementById('change-background-btn') as HTMLButtonElement | null;
    const promptEl = document.getElementById('background-prompt-input') as HTMLTextAreaElement | null;
    if (!btn || !promptEl) return;

    // Logic: Disable prompt if background image exists
    if (backgroundImage) {
        promptEl.disabled = true;
        promptEl.value = '';
    } else {
        promptEl.disabled = false;
    }
    
    const hasOriginal = !!originalImage;
    const hasBackground = !!backgroundImage;
    const hasPrompt = promptEl.value.trim() !== '';

    btn.disabled = isLoading || !hasOriginal || (!hasBackground && !hasPrompt);
}

/**
 * Updates the state of the "Restore Photo" button.
 */
function updateRestoreButtonState() {
     const btn = document.getElementById('restore-btn') as HTMLButtonElement | null;
     if (!btn) return;
     btn.disabled = isLoading || !restorationImage;
}

/**
 * Handles generating a background prompt suggestion.
 */
async function handleGenerateBackgroundPromptClick(suggestion: string = "") {
    if (!originalImage) {
        alert("Vui lòng tải lên ảnh gốc trước.");
        return;
    }

    isLoading = true;
    const generateBtn = document.getElementById('generate-bg-prompt-btn') as HTMLButtonElement;
    const suggestionWrapperEl = document.getElementById('suggestion-wrapper')!;
    const promptButtonsEl = generateBtn.parentElement!;

    suggestionWrapperEl.classList.add('hidden');
    const spinner = document.createElement('span');
    spinner.className = 'small-spinner';
    promptButtonsEl.appendChild(spinner);
    updateChangeBackgroundBtnState();

    try {
        const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
        const base64 = originalImage.base64;

        const imagePart = {
            inlineData: {
                data: base64.split(',')[1],
                mimeType: originalImage.file.type
            }
        };
        const textPart = { text: `Analyze the subject in this image. Create a detailed, professional photography background prompt that would complement the subject. The user suggested: "${suggestion}". The background should be realistic and harmonious with the subject's lighting and style. Only return the prompt text.` };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, textPart] },
        });

        const promptEl = document.getElementById('background-prompt-input') as HTMLTextAreaElement;
        if(promptEl) {
            promptEl.value = response.text;
            promptEl.dispatchEvent(new Event('input')); 
        }

    } catch (error) {
        console.error("Error generating background prompt:", error);
        alert(`Không thể tạo mô tả: ${(error as Error).message}`);
    } finally {
        isLoading = false;
        spinner.remove();
        const suggestionInputEl = document.getElementById('suggestion-input') as HTMLInputElement;
        suggestionInputEl.value = '';
        generateBtn.classList.remove('hidden');
        updateChangeBackgroundBtnState();
    }
}

/**
 * Handles the main "Change Background" action.
 */
async function handleChangeBackgroundClick() {
     if (isLoading || !originalImage) return;
    isLoading = true;
    updateChangeBackgroundBtnState();
    outputEl.innerHTML = `
        <div class="spinner"></div>
        <p>Đang thay đổi nền... Việc này có thể mất một chút thời gian.</p>
    `;

    try {
        const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
        const promptEl = document.getElementById('background-prompt-input') as HTMLTextAreaElement;
        
        const parts = [];

        // 1. Add Original Image
        parts.push({
            inlineData: {
                data: originalImage.base64.split(',')[1],
                mimeType: originalImage.file.type
            }
        });

        // 2. Add Background (Image or Text)
        let backgroundInstruction = '';
        if (backgroundImage) {
            parts.push({
                inlineData: {
                    data: backgroundImage.base64.split(',')[1],
                    mimeType: backgroundImage.file.type
                }
            });
            backgroundInstruction = "using the second image provided as the new background.";
        } else {
            backgroundInstruction = `placing the subject into a new background described as: "${promptEl.value}".`;
        }

        // 3. Add the main instruction prompt
        const instructionText = `
            **ROLE: Professional Photo Editor.**
            **TASK:** Your task is to expertly replace the background of the first image (the original subject). You must meticulously cut out the subject and place it seamlessly into the new background.
            **INSTRUCTIONS:**
            1.  Identify and isolate the primary subject(s) from the first image.
            2.  Place the isolated subject(s) into the new context ${backgroundInstruction}
            3.  **Crucially, you must create a photorealistic final image.** This means harmonizing lighting, shadows, color grading, and perspective between the subject and the new background. The final result should look like a single, professionally taken photograph, not a composite.
        `;
        parts.push({ text: instructionText });

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: { parts: parts },
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
            },
        });

        let outputHtml = '';
        let textContent = '';
        lastGeneratedImageUrl = null;
        
        if (response.candidates && response.candidates.length > 0) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    const imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                    lastGeneratedImageUrl = imageUrl;
                    outputHtml += `<img src="${imageUrl}" alt="Generated Image" class="generated-image">`;
                } else if (part.text) {
                     // We don't typically expect text back from this specific prompt, but handle it just in case.
                    textContent += `<p>${part.text.replace(/\n/g, '<br>')}</p>`;
                }
            }
        }
        renderOutput(outputHtml + textContent);

    } catch (error) {
        console.error(error);
        const errorMessage = `<p class="error">Đã xảy ra lỗi: ${(error as Error).message}</p>`;
        renderOutput(errorMessage);
    } finally {
        isLoading = false;
        updateChangeBackgroundBtnState();
    }
}

/**
 * Handles the main "Restore Photo" action.
 */
async function handleRestoreClick() {
    if (isLoading || !restorationImage) return;
    isLoading = true;
    updateRestoreButtonState();
    outputEl.innerHTML = `
        <div class="spinner"></div>
        <p>Đang phục hồi ảnh... Việc này có thể mất một chút thời gian.</p>
    `;

    try {
        const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

        const colorizeEl = document.getElementById('colorize-checkbox') as HTMLInputElement;
        const faceRotateEl = document.getElementById('face-rotate-checkbox') as HTMLInputElement;
        const outfitSelectEl = document.getElementById('outfit-select') as HTMLSelectElement;
        const customOutfitInputEl = document.getElementById('custom-outfit-input') as HTMLTextAreaElement;

        // Construct the prompt
        let prompt = `
            **ROLE:** You are a world-class expert in digital photo restoration and enhancement.
            **PRIMARY GOAL:** Your primary task is to restore the provided old/damaged photograph. The final result must be sharp, clear, and look as if it were taken with a modern, high-end professional camera. This includes fixing scratches, removing noise, and improving details.
            **ABSOLUTE CONSTRAINT: THE MOST IMPORTANT RULE:** You must preserve the absolute identity and likeness of any person in the photograph. The restored face and features must be 100% identical to the original, only enhanced in clarity and quality. DO NOT alter their identity.
            **MOST REQUIRED:** Retain 100% of the facial features of the person in the original photo. **USE THE UPLOADED IMAGE AS THE MOST ACCURATE REFERENCE FOR THE FACE.** Absolutely do not change the lines, eyes, nose, mouth. Photorealistic studio portrait. Skin shows fine micro-texture and subtle subsurface scattering; eyes tack sharp; hairline blends cleanly with individual strands and natural fly away. Fabric shows authentic weave, seams and natural wrinkles; metals reflect with tiny imperfections. Lighting coherent with scene; natural shadow falloff on cheekbone, jawline and nose. Background has believable micro-details; avoid CGI-clean look. 85mm equivalent, f/2.0 to f/2.8; subject tack sharp, cinematic color grade; confident posture, slight asymmetry.
        `;

        if (colorizeEl.checked) {
            prompt += `\n- **ADDITIONAL TASK: Colorize:** Professionally colorize this photograph. The colors should be realistic, natural, and appropriate for the scene. Skin tones must be lifelike.`;
        }
        if (faceRotateEl.checked) {
            prompt += `\n- **ADDITIONAL TASK: Face Rotation:** The photo contains one person. You must adjust their pose to be front-facing. This rotation must be subtle and natural, while strictly adhering to the **ABSOLUTE CONSTRAINT** of preserving their exact facial identity.`;
        }
        
        let outfitSelection = outfitSelectEl.value;
        if (outfitSelection === 'custom') {
            outfitSelection = customOutfitInputEl.value;
        }

        if (outfitSelection !== 'none' && outfitSelection.trim() !== '') {
            prompt += `\n- **ADDITIONAL TASK: Change Outfit:** Replace the original clothing of the main subject with a '${outfitSelection}'. The new outfit must be seamlessly integrated, with realistic lighting, shadows, and fabric texture that matches the restored image's quality. Ensure the new clothing fits the subject's posture and body shape naturally.`;
        }
        
        prompt += `\n**FINAL OUTPUT FORMAT:** The output must be only the final, restored image.`;


        const imagePart = {
            inlineData: {
                data: restorationImage.base64.split(',')[1],
                mimeType: restorationImage.file.type
            }
        };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: { parts: [imagePart, {text: prompt}] },
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
            },
        });

        let outputHtml = '';
        let textContent = '';
        lastGeneratedImageUrl = null;
        
        if (response.candidates && response.candidates.length > 0) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    const imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                    lastGeneratedImageUrl = imageUrl;
                    outputHtml += `<img src="${imageUrl}" alt="Generated Image" class="generated-image">`;
                } else if (part.text) {
                    textContent += `<p>${part.text.replace(/\n/g, '<br>')}</p>`;
                }
            }
        }
        renderOutput(outputHtml + textContent);

    } catch (error) {
        console.error(error);
        const errorMessage = `<p class="error">Đã xảy ra lỗi: ${(error as Error).message}</p>`;
        renderOutput(errorMessage);
    } finally {
        isLoading = false;
        updateRestoreButtonState();
    }
}


// --- Functions from the original Generator Tab ---

function handleClearPromptClick() {
    if (promptInputEl) {
        promptInputEl.value = '';
        promptInputEl.dispatchEvent(new Event('input'));
    }
}

function handleFileSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files) {
        handleFiles(Array.from(target.files));
    }
}

function handleDragOver(event: DragEvent) {
    event.preventDefault();
    imageUploadEl?.classList.add('active');
}

function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    imageUploadEl?.classList.remove('active');
}

function handleDrop(event: DragEvent) {
    event.preventDefault();
    imageUploadEl?.classList.remove('active');
    if (event.dataTransfer?.files) {
        handleFiles(Array.from(event.dataTransfer.files));
    }
}

async function handleFiles(files: File[]) {
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    for (const file of imageFiles) {
        const base64 = await fileToBase64(file);
        const id = `file-${Date.now()}-${Math.random()}`;
        uploadedFiles.push({ file, base64, id });
    }
    renderImagePreviews();
    updateGenerateButtonState();
}

function renderImagePreviews() {
    if (!imagePreviewEl) return;
    imagePreviewEl.innerHTML = '';
    uploadedFiles.forEach(fileData => {
        const previewItem = document.createElement('div');
        previewItem.className = 'preview-item';
        previewItem.innerHTML = `
            <img src="${fileData.base64}" alt="${fileData.file.name}" />
            <button class="remove-btn" data-id="${fileData.id}" aria-label="Remove ${fileData.file.name}">&times;</button>
        `;
        previewItem.querySelector('.remove-btn')?.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent parent drop-zone click event
            removeFile(fileData.id)
        });
        imagePreviewEl.appendChild(previewItem);
    });
}

function removeFile(id: string) {
    uploadedFiles = uploadedFiles.filter(f => f.id !== id);
    renderImagePreviews();
    updateGenerateButtonState();
}

function updateUiForMode() {
    if (activeTab !== 'generate' || !aspectRatioEl || !keepFaceSectionEl || !analyzeBtnEl) return;
    
    const hasImages = uploadedFiles.length > 0;
    aspectRatioEl.disabled = hasImages;
    (aspectRatioEl.parentElement as HTMLElement).classList.toggle('disabled', hasImages);
    keepFaceSectionEl.classList.toggle('hidden', !hasImages);
    analyzeBtnEl.disabled = isLoading;
}

function updateGenerateButtonState() {
    if (activeTab !== 'generate' || !generateBtnEl || !promptInputEl) return;
    generateBtnEl.disabled = promptInputEl.value.trim() === '' || isLoading;
    updateUiForMode();
}

function clearOutput() {
    outputEl.innerHTML = `
        <div class="placeholder">
            <p>Ảnh của bạn sẽ xuất hiện ở đây.</p>
        </div>
    `;
    lastGeneratedImageUrl = null;
}

function renderOutput(content: string) {
    if (!lastGeneratedImageUrl || !content.trim()) {
        const errorMessage = content.trim() ? content : `<p class="error">Không thể tạo nội dung. Mô hình có thể đã không trả về ảnh hoặc văn bản.</p>`;
        outputEl.innerHTML = `
            <div class="output-content">
                ${errorMessage}
            </div>
            <button id="clear-btn" class="clear-btn">Xóa</button>
        `;
    } else {
        outputEl.innerHTML = `
            <div class="output-content">
                ${content}
            </div>
            <div class="output-actions">
                <button id="zoom-btn" class="action-btn" aria-label="Phóng to ảnh">Phóng to</button>
                <button id="regenerate-btn" class="action-btn" aria-label="Tạo lại ảnh">Tạo lại</button>
                <button id="download-btn" class="action-btn" aria-label="Tải xuống ảnh">Tải xuống</button>
                <button id="download-resize-btn" class="action-btn" aria-label="Tải xuống ảnh đã đổi kích thước">Tải xuống (đã đổi kích thước)</button>
            </div>
            <button id="clear-btn" class="clear-btn">Xóa</button>
        `;

        document.getElementById('zoom-btn')?.addEventListener('click', handleZoomClick);
        document.getElementById('regenerate-btn')?.addEventListener('click', handleRegenerateClick);
        document.getElementById('download-btn')?.addEventListener('click', handleDownloadClick);
        document.getElementById('download-resize-btn')?.addEventListener('click', handleDownloadResizedClick);
    }

    const clearBtn = document.getElementById('clear-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearOutput);
    }
}

function handleAnalyzeClick() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.addEventListener('change', async (event) => {
        if (!promptInputEl || !analyzeBtnEl) return;
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];

        if (!file) return;

        isLoading = true;
        analyzeBtnEl.innerHTML = '<span class="small-spinner"></span> Đang phân tích...';
        updateGenerateButtonState();

        try {
            const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
            const base64 = await fileToBase64(file);

            const imagePart = {
                inlineData: {
                    data: base64.split(',')[1],
                    mimeType: file.type
                }
            };
            const textPart = { text: "Describe this image for a generative AI. Create a detailed prompt that would help generate a similar image, focusing on subject, style, colors, and composition. Only prompt send back" };

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [imagePart, textPart] },
            });

            promptInputEl.value = response.text;
            promptInputEl.dispatchEvent(new Event('input'));

        } catch (error) {
            console.error("Error analyzing image:", error);
            alert(`Không thể phân tích ảnh: ${(error as Error).message}`);
        } finally {
            isLoading = false;
            analyzeBtnEl.innerHTML = 'Phân tích ảnh';
            updateGenerateButtonState();
        }
    });

    input.click();
}

async function handleGenerateClick() {
    if (isLoading || !promptInputEl) return;
    isLoading = true;
    updateGenerateButtonState();
    outputEl.innerHTML = `
        <div class="spinner"></div>
        <p>Đang tạo ảnh... Việc này có thể mất một chút thời gian.</p>
    `;

    try {
        const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

        if (uploadedFiles.length > 0) {
            // EDIT MODE
            const imageParts = uploadedFiles.map(fileData => ({
                inlineData: {
                    data: fileData.base64.split(',')[1],
                    mimeType: fileData.file.type
                }
            }));
            
            let finalPrompt = promptInputEl.value;
            if (keepFaceCheckboxEl && keepFaceCheckboxEl.checked) {
                const facePrompt = "**MOST REQUIRED:** Retain 100% of the facial features of the person in the original photo. **USE THE UPLOADED IMAGE AS THE MOST ACCURATE REFERENCE FOR THE FACE.** Absolutely do not change the lines, eyes, nose, mouth. Photorealistic studio portrait. Skin shows fine micro-texture and subtle subsurface scattering; eyes tack sharp; hairline blends cleanly with individual strands and natural fly away. Fabric shows authentic weave, seams and natural wrinkles; metals reflect with tiny imperfections. Lighting coherent with scene; natural shadow falloff on cheekbone, jawline and nose. Background has believable micro-details; avoid CGI-clean look. 85mm equivalent, f/2.0–f/2.8; subject tack sharp, cinematic color grade; confident posture, slight asymmetry.";
                finalPrompt = `${facePrompt} ${promptInputEl.value}`;
            }
            const textPart = { text: finalPrompt };
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image-preview',
                contents: { parts: [...imageParts, textPart] },
                config: {
                    responseModalities: [Modality.IMAGE, Modality.TEXT],
                },
            });
            
            let outputHtml = '';
            let textContent = '';
            lastGeneratedImageUrl = null;
            
            if (response.candidates && response.candidates.length > 0) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData) {
                        const imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                        lastGeneratedImageUrl = imageUrl;
                        outputHtml += `<img src="${imageUrl}" alt="Generated Image" class="generated-image">`;
                    } else if (part.text) {
                        textContent += `<p>${part.text.replace(/\n/g, '<br>')}</p>`;
                    }
                }
            }
            renderOutput(outputHtml + textContent);

        } else {
            // GENERATE MODE
             if(!aspectRatioEl) throw new Error("Aspect ratio element not found");
            const response = await ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: promptInputEl.value,
                config: {
                  numberOfImages: 1,
                  outputMimeType: 'image/jpeg',
                  aspectRatio: aspectRatioEl.value as "1:1" | "3:4" | "4:3" | "9:16" | "16:9",
                },
            });
            
            if (response.generatedImages && response.generatedImages.length > 0) {
                const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
                const imageUrl = `data:image/jpeg;base64,${base64ImageBytes}`;
                lastGeneratedImageUrl = imageUrl;
                const outputHtml = `<img src="${imageUrl}" alt="Generated Image" class="generated-image">`;
                renderOutput(outputHtml);
            } else {
                renderOutput(`<p class="error">Không thể tạo ảnh từ mô tả.</p>`);
            }
        }

    } catch (error) {
        console.error(error);
        const errorMessage = `<p class="error">Đã xảy ra lỗi: ${(error as Error).message}</p>`;
        renderOutput(errorMessage);
    } finally {
        isLoading = false;
        if(activeTab === 'generate') updateGenerateButtonState();
    }
}

function handleZoomClick() {
    if (lastGeneratedImageUrl) {
        zoomedImgEl.src = lastGeneratedImageUrl;
        zoomModalEl.style.display = 'flex';
    }
}

function closeZoomModal() {
    zoomModalEl.style.display = 'none';
}

function handleDownloadClick() {
    if (lastGeneratedImageUrl) {
        const a = document.createElement('a');
        a.href = lastGeneratedImageUrl;
        a.download = `generated-image-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
}

function handleDownloadResizedClick() {
    if (!lastGeneratedImageUrl) return;

    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const minSide = 400;
        let newWidth: number, newHeight: number;

        if (img.width < img.height) {
            newWidth = minSide;
            newHeight = img.height * (minSide / img.width);
        } else {
            newHeight = minSide;
            newWidth = img.width * (minSide / img.height);
        }

        canvas.width = newWidth;
        canvas.height = newHeight;

        ctx.drawImage(img, 0, 0, newWidth, newHeight);

        const dataUrl = canvas.toDataURL('image/png');

        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `generated-image-resized-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };
    img.onerror = () => {
        console.error("Không thể tải ảnh để thay đổi kích thước.");
    };
    img.src = lastGeneratedImageUrl;
}

function handleRegenerateClick() {
    if (activeTab === 'generate') {
        handleGenerateClick();
    } else if (activeTab === 'background') {
        handleChangeBackgroundClick();
    } else if (activeTab === 'restore') {
        handleRestoreClick();
    }
}

function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
}

App();