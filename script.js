document.addEventListener('DOMContentLoaded', () => {

    const consoleOut = document.getElementById('consoleOutput');
    const overlay = document.getElementById('processingOverlay');
    const loadingMsg = document.getElementById('loadingMsg');

    const apiKeyInput = document.getElementById('apiKey');
    const brandInput = document.getElementById('brandName');
    const valInput = document.getElementById('valSet');
    const ctxInput = document.getElementById('ctxData');
    const apiStatusBadge = document.getElementById('apiStatus');
    const modelStatus = document.getElementById('modelStatus');

    // Save key to session storage to avoid losing it on refresh
    if (sessionStorage.getItem('gemini_api_key')) {
        apiKeyInput.value = sessionStorage.getItem('gemini_api_key');
        updateApiStatus();
    }

    apiKeyInput.addEventListener('change', () => {
        sessionStorage.setItem('gemini_api_key', apiKeyInput.value);
        updateApiStatus();
    });

    function updateApiStatus() {
        if (apiKeyInput.value.trim().length > 10) {
            apiStatusBadge.innerHTML = '<i class="fas fa-check"></i> API Ready';
            apiStatusBadge.className = 'badge';
            apiStatusBadge.style.borderColor = 'rgba(0, 255, 136, 0.3)';
            apiStatusBadge.style.color = 'var(--accent-green)';
            modelStatus.innerHTML = 'Online (gemini-1.5-flash)';
        } else {
            apiStatusBadge.innerHTML = '<i class="fas fa-bolt"></i> 需設定 API Key';
            apiStatusBadge.className = 'badge warning';
            modelStatus.innerHTML = 'Standby';
        }
    }

    // Helper to log to console
    function log(message, type = 'info', speed = 5) {
        return new Promise(resolve => {
            const line = document.createElement('div');
            line.className = `log-line ${type}`;
            consoleOut.appendChild(line);

            let i = 0;
            function typeChar() {
                if (i < message.length) {
                    line.textContent += message.charAt(i);
                    i++;
                    consoleOut.scrollTop = consoleOut.scrollHeight;
                    // faster typing for longer text
                    setTimeout(typeChar, speed);
                } else {
                    resolve();
                }
            }
            typeChar();
        });
    }

    // Direct HTML logging for Markdown
    function logHTML(htmlContent, type = 'info') {
        const line = document.createElement('div');
        line.className = `log-line markdown-body ${type}`;
        line.innerHTML = htmlContent;
        consoleOut.appendChild(line);
        consoleOut.scrollTop = consoleOut.scrollHeight;
    }

    function clearConsole() {
        consoleOut.innerHTML = '';
    }

    function showLoader(message = 'Processing Block Protocol...') {
        loadingMsg.textContent = message;
        overlay.classList.remove('hidden');
    }

    function hideLoader() {
        overlay.classList.add('hidden');
    }

    function getInputs() {
        return {
            apiKey: apiKeyInput.value.trim(),
            brandName: brandInput.value.trim() || '未命名品牌',
            valSet: valInput.value.trim() || '未定義',
            ctxData: ctxInput.value.trim() || '未定義'
        };
    }

    // Dynamic Model Detection
    const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

    async function listModels(apiKey) {
        const url = `${API_BASE}/models?key=${apiKey}`;
        const res = await fetch(url);
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            throw new Error(`[${res.status}] ${data?.error?.message || "ListModels failed"}`);
        }

        // 只留下支援 generateContent 的模型
        return (data.models || []).filter(m =>
            (m.supportedGenerationMethods || []).includes("generateContent")
        );
    }

    function pickModel(models, preferred = "gemini-2.5-flash") {
        const preferredName = preferred.startsWith("models/") ? preferred : `models/${preferred}`;
        const found = models.find(m => m.name === preferredName);
        const chosen = (found?.name || models[0]?.name || preferredName);
        return chosen.replace(/^models\//, ""); // 回傳純 model code
    }

    // Call Gemini API
    async function fetchGemini(prompt, systemInstruction = "你是一個頂級的品牌戰略家與文案大師。") {
        const inputs = getInputs();
        if (!inputs.apiKey) {
            throw new Error("請先在左側輸入 Google Gemini API Key！");
        }

        const cleanApiKey = inputs.apiKey.trim();

        let model = "gemini-1.5-pro"; // 預設後備模型
        try {
            const models = await listModels(cleanApiKey);
            model = pickModel(models, "gemini-2.5-flash"); // 優先選擇 2.5 flash
            // 更新 UI 顯示目前抓到的模型
            document.getElementById('modelStatus').innerHTML = `Online (${model})`;
        } catch (e) {
            console.warn("無法取得模型清單，使用預設模型: ", e);
        }

        const url = `${API_BASE}/models/${model}:generateContent?key=${cleanApiKey}`;
        console.log("Generating with Model:", model);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    system_instruction: {
                        parts: [{ text: systemInstruction }]
                    },
                    contents: [{
                        parts: [{ text: prompt }]
                    }],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 8192,
                    }
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                console.error("Gemini API Error Response:", errData);
                throw new Error(`API 請求失敗: ${errData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            if (data.candidates && data.candidates.length > 0) {
                return data.candidates[0].content.parts[0].text;
            } else {
                console.error("Unexpected API Response format:", data);
                throw new Error('API 未回傳預期內容，請檢查輸入是否違反安全政策。');
            }
        } catch (error) {
            console.error("fetchGemini error:", error);
            throw error;
        }
    }

    // --- Action Functions ---

    window.runInitBrandKit = async function () {
        const inputs = getInputs();
        clearConsole();

        if (!inputs.apiKey) {
            await log('[ERROR] 系統錯誤：未偵測到 API Key。請於左側選單輸入。', 'error');
            return;
        }

        await log(`Running InitBrandKit("${inputs.brandName}")... Connecting to AI...`, 'system');
        showLoader('Initializing Brand Matrix via AI...');

        const prompt = `
        任務：這是一個新品牌的初始化動作。
        品牌名稱：${inputs.brandName}
        
        請用系統初始化的口吻，生成一份名為 brand_draft.md 的初步大綱。
        包含：
        1. 系統代號 (幫這個品牌取一個科技感的計畫代號)
        2. 任務確立 (簡述如果這個品牌要成立，它的初衷可能為何，只需 50 字)
        
        格式：請用 Markdown 撰寫，保持精簡、具科技感與駭客感。
        `;

        try {
            const result = await fetchGemini(prompt, "你是一個名為 JO-OS 的底層邏輯系統，說話方式冷靜、精確、帶有終端機的風格。");
            hideLoader();
            await log(`[SUCCESS] AI Protocol initialized.`, 'success');
            logHTML(marked.parse(result));
        } catch (error) {
            hideLoader();
            await log(`[ERROR] ${error.message}`, 'error');
        }
    };

    window.runApplyPositioning = async function () {
        const inputs = getInputs();
        if (consoleOut.innerHTML === '') clearConsole();

        if (!inputs.apiKey) {
            await log('[ERROR] 系統錯誤：未偵測到 API Key。請於左側選單輸入。', 'error');
            return;
        }

        await log(`\nRunning ApplyPositioning(val_set)... Analyzing Value Sets...`, 'system');
        showLoader('Extracting Positioning Dimensions...');

        const prompt = `
        品牌名稱：${inputs.brandName}
        原始價值主張集合：${inputs.valSet}
        
        任務：請將上述混亂的原始價值主張，提煉並「壓縮」成 3 個精確的定位區塊 (POSITION_BLOCK)。
        請輸出以下格式：
        1. 核心信念定位 (一句話的標語，非常有力量)
        2. 市場區隔維度 (它的特性是什麼)
        3. 品牌性格預設值 (給出 3 個形容詞)
        
        用 Markdown 呈現，無需說多餘的廢話，直接給結構化資料。
        `;

        try {
            const result = await fetchGemini(prompt);
            hideLoader();
            await log(`[SUCCESS] Positioning Map generated by AI.`, 'success');
            logHTML(marked.parse(result));
        } catch (error) {
            hideLoader();
            await log(`[ERROR] ${error.message}`, 'error');
        }
    };

    window.runGenerateValueProps = async function () {
        const inputs = getInputs();
        if (consoleOut.innerHTML === '') clearConsole();

        if (!inputs.apiKey) {
            await log('[ERROR] 系統錯誤：未偵測到 API Key。請於左側選單輸入。', 'error');
            return;
        }

        await log(`\nRunning GenerateValueProps(ctx)... Decoding Context...`, 'system');
        showLoader('Computing Core Value Propositions...');

        const prompt = `
        品牌名稱：${inputs.brandName}
        價值主張簡述：${inputs.valSet}
        背景與目標脈絡：${inputs.ctxData}
        
        任務：請根據目標受眾與脈絡，推導出 3 層次的價值主張 (VALUE_BLOCK)。
        請嚴格遵照以下結構：
        - 實用價值 (Functional Value)：產品到底能幫使用者做些什麼？
        - 情感價值 (Emotional Value)：使用產品後，使用者的心裡會有什麼感受？
        - 象徵價值 (Symbolic Value)：選擇這個品牌，代表了使用者是什麼樣的人？(例如：顛覆者、先行者)
        
        用 Markdown 呈現。說明文字必須具有煽動力。
        `;

        try {
            const result = await fetchGemini(prompt);
            hideLoader();
            await log(`[SUCCESS] Value Propositions Structured.`, 'success');
            logHTML(marked.parse(result));
        } catch (error) {
            hideLoader();
            await log(`[ERROR] ${error.message}`, 'error');
        }
    };

    window.runComposeNarrative = async function () {
        const inputs = getInputs();
        clearConsole();

        if (!inputs.apiKey) {
            await log('[ERROR] 系統錯誤：未偵測到 API Key。請於左側選單輸入。', 'error');
            return;
        }

        await log(`Running AI Engine: ComposeNarrative(position, value)...`, 'system');
        showLoader('Weaving Neural Narrative Framework...');

        const prompt = `
        品牌名稱：${inputs.brandName}
        核心價值主張：${inputs.valSet}
        目標市場脈絡：${inputs.ctxData}
        
        你是一位為全球頂級奢侈品與高端科技品牌（如 Apple、Hermès、Bang & Olufsen）操刀的首席品牌戰略家與文案總監。
        請根據以上資訊，撰寫一份對外的【品牌宣言 (Brand Manifesto)】，或者是創辦人故事，這份文件叫做 story.md。
        請使用以下骨架結構撰寫（請寫出動人且克制的長篇文案）：
        
        ### 【起：痛點與現狀的洞察】
        (以極度冷靜、細膩且高級的筆觸，點出目標受眾在現狀中未能被滿足的深層渴望或品味斷層)
        
        ### 【承：信念與純粹】
        (陳述品牌如何以近乎偏執的工匠精神與高維度的美學，看待並解決這個問題)
        
        ### 【轉：價值主張與賦能】
        (優雅地展現產品/品牌的存在如何成為他們品味與生活方式的延伸，帶來毫不費力的卓越體驗)
        
        ### 【合：願景與邀請 (Call to Action)】
        (以克制但具備強大吸引力的結尾，邀請少數懂得欣賞的知音進入這個嶄新的境界)
        
        風格要求：
        1. 語氣必須極致高級、內斂、優雅且充滿深度的自信。
        2. 絕對禁止任何中二、浮誇、情緒化、或是憤世嫉俗的字眼。
        3. 用詞要精準、俐落，充滿留白的美感。
        4. 輸出完整的 Markdown。
        `;

        try {
            const result = await fetchGemini(prompt, "你是一位服務頂尖客群的首席品牌總監。你的文字風格極度高級、優雅、內斂、深具哲理且充滿留白的美感，絕不浮誇與中二。");
            hideLoader();
            await log(`[SUCCESS] The Narrative has been expertly crafted.`, 'success');
            logHTML(marked.parse(result));

            await log(`\n[SYSTEM] BLOCK-SK-BRAND-V1 執行完畢。`, 'system');
        } catch (error) {
            hideLoader();
            await log(`[ERROR] ${error.message}`, 'error');
        }
    };

    // Helper to fill demo data
    window.fillDemoData = function () {
        brandInput.value = 'LUMINA SCULPT';
        valInput.value = '我們將光影視為空間的靈魂，而非單純的照明。透過隱藏式、可編程的光學演算，為頂級豪宅與藝廊提供能隨情緒與時間流動的光景。痛點是市面上的燈具過於突兀，破壞了建築本身的空間純粹性。';
        ctxInput.value = '目標客群是頂尖建築師、藝術收藏家與追求極致生活品味的層峰人士。市場上充斥著強調參數卻缺乏美學的工業產品。我們希望呈現一種極致安靜、優雅、毫不費力卻又深具科技底蘊的高級感。';
    };
});
