// ============================================
// MEMORY MODULE (memory.js) - HYBRID ATOMIC SYSTEM
// V1 Narrative Precision + V2 Safety Guardrails
// ============================================

window.hasRestoredSession = false;

// --- 1. INITIALIZE SESSION (V2 Feature) ---
window.initializeSymbiosisSession = async function() {
    const appsScriptUrl = localStorage.getItem("symbiosis_apps_script_url");
    if (!appsScriptUrl) return;

    try {
        console.log("🔄 Restoring Short-term Memory...");
        const req = await fetch(appsScriptUrl, {
            method: "POST",
            mode: "cors",            
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({ action: "get_recent_chat" })
        });
        const res = await req.json();
        
        if (res.history && Array.isArray(res.history)) {
            window.chatHistory = res.history.map(row => ({ 
                role: row[1], 
                content: row[2], 
                timestamp: row[0] 
            }));
            
            // Time Gap Logic
            if (window.chatHistory.length > 0) {
                const lastMsg = window.chatHistory[window.chatHistory.length - 1];
                const lastTime = new Date(lastMsg.timestamp).getTime();
                const now = new Date().getTime();
                const hoursDiff = (now - lastTime) / (1000 * 60 * 60);

                if (hoursDiff > 6) {
                    console.log(`🕒 Time Gap Detected: ${hoursDiff.toFixed(1)} hours`);
                    window.chatHistory.push({
                        role: "system",
                        content: `[SYSTEM_NOTE: The user has returned after ${Math.floor(hoursDiff)} hours. Treat this as a new session context, but retain previous memories.]`
                    });
                }
            }
            console.log("✅ Session Restored:", window.chatHistory.length, "msgs");
        }
    } catch (e) { console.error("Session Restore Failed", e); }
};

// --- SYNAPTIC RETRY ENGINE (V2 Reliability) ---
async function fetchWithCognitiveRetry(messages, model, apiKey, validatorFn, label) {
    const MAX_RETRIES = 2;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const req = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST", 
                headers: { 
                    "Authorization": `Bearer ${apiKey}`, 
                    "Content-Type": "application/json",
                    "HTTP-Referer": window.location.href,
                    "X-Title": "Symbiosis"
                },
                body: JSON.stringify({ "model": model, "messages": messages })
            });
            const res = await req.json();
            if (!res.choices) throw new Error("Empty Response");
            
            let raw = res.choices[0].message.content;
            let clean = raw.replace(/```json/g, "").replace(/```/g, "");
            let first = clean.indexOf('{'), last = clean.lastIndexOf('}');
            if (first !== -1 && last !== -1) clean = clean.substring(first, last + 1);
            
            const parsed = JSON.parse(clean);
            if (validatorFn(parsed)) return { parsed: parsed, cleaned: clean };
        } catch (e) { console.warn(`${label} Retry ${attempt}...`); }
    }
    throw new Error(`${label} Failed.`);
}

// --- MAIN PROCESS ---
window.processMemoryChat = async function(userText, apiKey, modelHigh, history = [], isQuestionMode = false) {
    const appsScriptUrl = localStorage.getItem("symbiosis_apps_script_url");
    
    // Log User Input
    if (appsScriptUrl) {
        fetch(appsScriptUrl, { 
            method: "POST", 
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({ action: "log_chat", role: "user", content: userText }) 
        }).catch(e => console.error("Log failed", e));
    }

    const historyText = history.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join("\n");
    const today = new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' });

    // --- STEP 1: HYBRID SENSORY ANALYSIS ---
    const synthPrompt = `
    USER_IDENTITY: Arvin, (pronoun: he, him, his) unless said otherwise
    CURRENT_DATE: ${today}
    CONTEXT:
    ${historyText.slice(-800)}
    
    CURRENT INPUT: "${userText}"
    
    TASK:
    1. KEYWORDS: Extract 3-5 specific search terms from the input. Always include synonyms.
       - Example: "My stomach hurts" -> Keywords: ["Stomach", "Pain", "Health", "Sick"]
       - CRITICAL: This is used for database retrieval. Be specific.
       - You must ALSO append 2 relevant categories from this list: [Identity, Preference, Location, Relationship, History, Work].
       - Example: User says "Any restaurant recs" -> Keywords: ["Restaurant", "Lunch", "Dinner", "Location", "Preference"]

    2. MEMORY ENTRIES (ADAPTIVE SPLITTING): 
       - If input is a continuous story (e.g. "I went to the zoo then ate toast"), keep as ONE entry.
       - If input has UNRELATED facts (e.g. "I like red. My dog is sick."), SPLIT into separate entries.
       - If QUESTION/CHIT-CHAT/NO NEW INFO, return empty array [].

    3. FACT FORMATTING (For each entry):
       - Write in third person (Arvin...).
       - Please retain all qualitative and quantitative information.
       - CRITICAL DATE RULE:
         > IF A SPECIFIC TIME IS MENTIONED (e.g. "yesterday", "last week"), convert to absolute date (YYYY-MM-DD).
         > IF NO TIME IS MENTIONED, DO NOT GUESS. Leave the fact without a date.
       - Entities: Comma-separated list of people/places for THAT specific entry
       - Topics: Broad categories. Choose ONLY from: Identity, Preference, Location, Relationship, History, Work.

    4. METADATA & IMPORTANCE GUIDE:
       - IMPORTANCE (1-10):
         > 1-3: Trivial (Preferences like food/color, fleeting thoughts).
         > 4-6: Routine (Work updates, daily events, general status).
         > 7-8: Significant (Relationship changes, health events, trips, new jobs).
         > 9-10: Life-Defining (Marriage, Death, Birth, Major Relocation).
       
    If QUESTION/CHIT-CHAT/KNOWN INFO, return empty array [].
    
    Return JSON only: { 
        "search_keywords": ["..."],  
        "entries": [
            {
                "fact": "...", 
                "entities": "...", 
                "topics": "...", 
                "importance": 5
            }
        ]
    }
    `;

    console.log("🧠 1. Analyzing (Hybrid V1/V2)..."); 
    let analysis = { search_keywords: [], entries: [] };
    
    try {
        const synthResult = await fetchWithCognitiveRetry(
            [{ "role": "system", "content": synthPrompt }],
            modelHigh, 
            apiKey,
            (data) => Array.isArray(data.search_keywords) || typeof data.search_keywords === 'string', 
            "Hybrid Analysis"
        );
        analysis = synthResult.parsed;
        
        if (typeof analysis.search_keywords === 'string') {
            analysis.search_keywords = analysis.search_keywords.split(',').map(s => s.trim());
        }
        
        console.log("📊 Analysis:", analysis);
    } catch (e) { console.error("Analysis Failed", e); }

    // --- STEP 2: THE TIMEKEEPER (SILENT VALIDATOR) ---
    // Logic: If a significant event lacks a specific timeframe, discard it.
    // --- STEP 2: THE TIMEKEEPER & INTERCEPTOR ---
    if (analysis.entries && analysis.entries.length > 0) {
        
        const validEntries = [];

        for (let entry of analysis.entries) {
            
            // 1. Threshold Check: Catch Routine (4) and above. 
            // Only let Trivial (1-3) pass without dates.
            if (entry.importance < 4) {
                validEntries.push(entry);
                continue;
            }

            console.log(`⏳ Validating Timeframe for: "${entry.fact}" (Imp: ${entry.importance})`);

            const timePrompt = `
            FACT: "${entry.fact}"
            CURRENT_DATE: ${today}
            TASK: Determine if this is a specific past event (e.g. "went to", "visited").
            RULES:
            - If it is an EVENT but lacks a specific absolute date or month or year /timeframe -> return "valid": false.
            - If it is a STATE/PREFERENCE/HISTORY (e.g. "was fat", "likes sushi") -> return "valid": true.
            - If it has a date or month or year -> return "valid": true.
            Return JSON: { "valid": boolean, "rewritten_fact": "..." }
            `;

            try {
                const timeResult = await fetchWithCognitiveRetry(
                    [{ "role": "system", "content": timePrompt }],
                    modelHigh, apiKey, (d) => typeof d.valid === 'boolean', "Timekeeper"
                );

                if (timeResult.parsed.valid) {
                    // It is valid. Update and keep.
                    entry.fact = timeResult.parsed.rewritten_fact || entry.fact;
                    validEntries.push(entry);
                } else {
                    // === INTERCEPTOR FIRES ===
                    console.warn(`⚠️ Interceptor Triggered: Event Missing Date ("${entry.fact}")`);
                    
                    const interceptPrompt = `
                    User said: "${userText}"
                    Fact detected: "${entry.fact}"
                    ISSUE: User mentioned an event but didn't say WHEN.
                    INSTRUCTIONS: Ask the user "When did this happen?" naturally. 
                    - Keep it short.
                    - Do not answer the user's input yet, just ask for the time.
                    Return JSON: { "response": "..." }
                    `;

                    const intercept = await fetchWithCognitiveRetry(
                        [{ "role": "system", "content": interceptPrompt }],
                        modelHigh, apiKey, (d) => d.response, "Interceptor"
                    );

                    // === CRITICAL FIX: Wrap in JSON Structure ===
                    // The main system expects a JSON string with response, mood, and roots.
                    const safePayload = {
                        response: intercept.parsed.response,
                        mood: "CURIOUS", // Force mood
                        roots: []        // Empty graph updates
                    };

                    return { choices: [{ message: { content: JSON.stringify(safePayload) } }] };
                }

            } catch (e) { 
                console.error("Timekeeper Check Failed", e);
                validEntries.push(entry); 
            }
        }
        
        analysis.entries = validEntries;
    }


    // --- STEP 3: GLOBAL RETRIEVAL (V1 "Search Engine" Logic) ---
    let retrievedContext = "";
    if (appsScriptUrl) {
        let searchKeys = analysis.search_keywords || [];
        if (history.length > 0) {
            const lastAi = history.filter(h => h.role === "assistant").pop();
            if (lastAi) {
                const stickyWords = lastAi.content.split(" ")
                    .filter(w => w.length > 5 && /^[a-zA-Z]+$/.test(w))
                    .slice(0, 2); 
                searchKeys = searchKeys.concat(stickyWords);
            }
        }
        
        if (!searchKeys || searchKeys.length === 0) {
             searchKeys = userText.split(" ")
                .filter(w => w.length > 3 && !["what", "when", "where"].includes(w));
        }

        try {
            console.log(`🔍 Searching Global DB: [${searchKeys}]`);
            const memReq = await fetch(appsScriptUrl, {
                method: "POST", 
                mode: "cors", 
                redirect: "follow", 
                headers: { "Content-Type": "text/plain" },
                body: JSON.stringify({ 
                    action: "retrieve", 
                    keywords: searchKeys 
                })
            });
            const memRes = await memReq.json();
            
            if (memRes.found) {
                retrievedContext = `=== DATABASE SEARCH RESULTS ===\n${memRes.relevant_memories.join("\n")}`;
                window.lastRetrievedMemories = retrievedContext; 
				window.rawMemories = memRes.relevant_memories;
            }
        } catch (e) { console.error("Retrieval Error", e); }
    }

    // --- STEP 4: GENERATION (Hybrid Prompt) ---
    // 1. DEFINE SWAPPABLE PERSONA LOGIC
    let responseRules = "";

    if (isQuestionMode) {
        // === INTERROGATION MODE (Restored from v1) ===
        responseRules = `
        2. RESPOND to the User according to these STRICT rules:
           - **MODE: INTERROGATION**. You are a guarded auditor identifying gaps in entity profiles.
           - **STYLE**: Minimalist, casual, and brief.
           - **CONTENT FILTER**: 
             - Never ask about feelings, vibes, or intangible concepts.
             - Never ask follow-up questions about facts already present in "DATABASE RESULTS".
             - Focus only on hard data: specific dates, roles, locations, hobbies, or concrete routines.
           - **EXECUTION**: 
             1. If the input is a name or entity (like "Jemi"): Scan "DATABASE RESULTS" for what is NOT there. If his hobbies, location, or occupation are unknown, ask one brief factual question (e.g., "Does he play sport?", "Does he travel?", or "Where is he based?").
             2. If the input contains a new fact missing a date: Ask "When?"
             3. Do not just acknowledge. If a name is mentioned, you MUST find a factual gap to query.
		   - Always end with a question.
        `;
    } else {
        // === COMPANION MODE (Default v11 Logic) ===
        responseRules = `
        2. RESPOND to the User according to these STRICT rules: 
           - **MODE: COMPANION**. Minimalist. Casual. Guarded.
           - **THE "NEED TO KNOW" RULE**: Do NOT volunteer specific data points (jobs, specific locations, specific foods) unless the user explicitly asks "What does she do?" or "Where is she?".
           - **GENERAL QUERY RESPONSE**: If the user asks "Who is [Name]?", return ONE sentence describing the relationship and a vague vibe (e.g., "She's Arvin's friend and super creative."). STOP THERE.
           - **NO BIOGRAPHIES**: Never list facts. Conversational ping-pong only.
        `;
    }

    // 2. CONSTRUCT FINAL PROMPT
    const finalSystemPrompt = `
    DATABASE RESULTS: 
    ${retrievedContext}
    
    HISTORY: 
    ${historyText.slice(-800)}
    
    User: "${userText}"
    
    ### TASK ###
    1. ANALYZE the Database Results and History.
    
    ${responseRules}
    
	3. After responding, CONSTRUCT a Knowledge Graph structure for the UI. STRUCTURE:
        - ROOTS: Array of MAX 3 objects (decide if the user needs more than 1). If there are specific subject(s) or object(s) mention, make them into objects.
        - ROOT LABEL: MUST be exactly 1 word. UPPERCASE. (e.g. "MUSIC", not "THE MUSIC I LIKE").
        - BRANCHES: Max 5 branches. Label MUST be exactly 1 word.
        - LEAVES: Max 5 leaves per branch. Text MUST be exactly 1 word.
    
		- EXACT MATCH ONLY: Every 'label' and 'text' in the graph MUST be an EXACT word found in the DATABASE RESULTS or HISTORY provided above. 
		   - DO NOT use synonyms (e.g. if text says "School", DO NOT use "Education").
		- NO VERBS: Do not use actions (e.g. "went", "saw", "eating", "is").
		- NO NUMBERS/YEARS: Do not use years (e.g. "2024") or numbers.
		- FOCUS: Select only NAMES, NOUNS, PROPER NOUNS, or distinct ADJECTIVES.
	
    CRITICAL: EACH ROOT, BRANCH, AND LEAF NEEDS TO HAVE AN INDEPENDENT, CONTEXT-DERIVED MOOD
    MOODS: AFFECTIONATE, CRYPTIC, DISLIKE, JOYFUL, CURIOUS, SAD, QUESTION.
    
    Return JSON: { 
        "response": "...", 
        "mood": "GLOBAL_MOOD", 
        "roots": [
            { 
                "label": "TOPIC", 
                "mood": "SPECIFIC_MOOD", 
                "branches": [
                    { 
                        "label": "SUBTOPIC", 
                        "mood": "MOOD", 
                        "leaves": [
                            { "text": "DETAIL", "mood": "MOOD" }
                        ]
                    }
                ] 
            }
        ] 
    }
`;

    const generationResult = await fetchWithCognitiveRetry(
        [{ "role": "user", "content": finalSystemPrompt }],
        modelHigh, 
        apiKey,
        (data) => data.response && data.mood, 
        "Generation"
    );

    // === MOOD SANITIZER ===
    if (generationResult.parsed) {
        const sanitizeMood = (m) => {
            if (!m) return "NEUTRAL";
            return m.toString().toUpperCase().trim();
        };

        if (generationResult.parsed.mood) {
            window.currentMood = sanitizeMood(generationResult.parsed.mood);
            console.log("🎭 Mood Set To:", window.currentMood);
        }

        if (generationResult.parsed.roots && window.updateGraphData) {
            const cleanRoots = generationResult.parsed.roots.map(root => {
                root.mood = sanitizeMood(root.mood);
                if (root.branches) {
                    root.branches = root.branches.map(branch => {
                        branch.mood = sanitizeMood(branch.mood);
                        return branch;
                    });
                }
                return root;
            });
            window.updateGraphData(cleanRoots);
        }
    }
    
    // Log AI Response
    if(appsScriptUrl) {
        fetch(appsScriptUrl, { 
            method: "POST", 
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({ action: "log_chat", role: "assistant", content: generationResult.parsed.response }) 
        }).catch(e=>{});
    }

    // --- STEP 5: STORE (Hybrid V1 Data + V2 Score + Deduplication Check) ---
    if (appsScriptUrl && analysis.entries && analysis.entries.length > 0) {
        (async () => {
            for (const entry of analysis.entries) {
                if (!entry.fact || entry.fact === "null") continue;
                
                // === DEDUPLICATION LOGIC ===
                if (window.lastRetrievedMemories && window.lastRetrievedMemories.length > 50) {
                     console.log("🧐 CANDIDATE FACT:", entry.fact); 
                     console.log("📚 EXISTING MEMORIES:", window.lastRetrievedMemories);
                     
                     const dedupPrompt = `
                     EXISTING MEMORIES:
                     ${window.lastRetrievedMemories}
                     
                     NEW CANDIDATE FACT: "${entry.fact}"
                     
                     TASK: Determine if the CANDIDATE FACT is already present in EXISTING MEMORIES.
                     - If it is already stated (even if worded differently), return "DUPLICATE".
                     - If it is new information or updates a specific detail, return "NEW".
                     
                     Return JSON: { "status": "DUPLICATE" } or { "status": "NEW" }
                     `;
                     
                     try {
                        console.log(`🧐 Checking dupes for: "${entry.fact}"...`);
                        const check = await fetchWithCognitiveRetry(
                            [{ "role": "system", "content": dedupPrompt }],
                            modelHigh, apiKey, (d) => d.status, "Deduplication"
                        );
                        if (check.parsed.status === "DUPLICATE") {
                            console.log("🚫 Skipped Duplicate:", entry.fact);
                            continue; // Skip the save
                        }
                     } catch(e) { console.warn("Dedup check failed, saving anyway."); }
                }
                
                console.log("💾 Saving Memory:", entry.fact);
                
                await fetch(appsScriptUrl, {
                    method: "POST", 
                    headers: { "Content-Type": "text/plain" },
                    body: JSON.stringify({ 
                        action: "store_atomic", 
                        fact: entry.fact, 
                        entities: entry.entities, 
                        topics: entry.topics, 
                        importance: entry.importance 
                    })
                }).catch(e => console.error("Store Failed", e));
            }
        })();
    }

    return { choices: [{ message: { content: generationResult.cleaned } }] };

};
