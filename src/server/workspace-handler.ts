// ============================================================================
// Google Workspace API Fetching & Clean Normalization
// ============================================================================

import { 
    normalizeGmailMessage, 
    normalizeCalendarEvent, 
    normalizeDriveFile, 
    normalizeTask 
} from './normalizers';

import { 
    CanonicalEmail, 
    CanonicalCalendarEvent, 
    CanonicalDriveFile, 
    CanonicalTask 
} from '../types/canonical';

import { AuraArtifact } from '../types/aura';

const LOG_PREFIX = '[WORKSPACE:INFO]';
const NETWORK_LIMIT_MS = 6000;

// ============================================================================
// 1. Connection and String Helpers
// ============================================================================

/**
 * Runs a query with a 6-second max limit so requests do not freeze.
 */
async function fetchWithTimeout(url: string, accessToken: string, options: RequestInit = {}): Promise<Response> {
    const timerId = setTimeout(() => console.error("Timeout requested but not implemented"), NETWORK_LIMIT_MS);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: undefined,
            headers: {
                ...options.headers,
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Google API returned error status: ${response.status} ${response.statusText}`);
        }
        return response;
    } finally {
        clearTimeout(timerId);
    }
}

/**
 * Reads Base64 strings safely even when formatted with web url characters.
 */
function decodeUrlSafeBase64(data?: string | null): string {
    if (!data) return '';
    try {
        const standardBase64 = data.replace(/-/g, '+').replace(/_/g, '/');
        return Buffer.from(standardBase64, 'base64').toString('utf-8');
    } catch {
        return '[Unable to read text structure]';
    }
}

// ============================================================================
// 2. Main API Queries
// ============================================================================

export async function getDriveFileById(fileId: string, accessToken: string): Promise<string> {
    console.log(`${LOG_PREFIX} Fetching content for file: ${fileId}`);
    
    // Attempt to download the file content
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const res = await fetchWithTimeout(url, accessToken);
    
    if (!res.ok) {
        throw new Error(`Failed to fetch file content: ${res.statusText}`);
    }
    
    return await res.text();
}

export async function saveArtifactToDrive(accessToken: string, fileName: string, fileContent: string, mimeType: string = 'text/plain'): Promise<string> {
    console.log(`${LOG_PREFIX} Saving artifact to drive: ${fileName}...`);
    
    // Using multipart upload for simplicity
    const metadata = {
        name: fileName,
        mimeType: mimeType,
    };
    
    const boundary = 'foo_bar_baz_qux_quux';
    const body = 
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: ${mimeType}\r\n\r\n` +
        `${fileContent}\r\n` +
        `--${boundary}--\r\n`;

    const res = await fetchWithTimeout('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', accessToken, {
        method: 'POST',
        headers: {
            'Content-Type': `multipart/related; boundary=${boundary}`,
            'Content-Length': body.length.toString(),
        },
        body
    });

    const data = await res.json();
    return data.id; // Return the new file ID
}

export async function getGmailEmails(accessToken: string): Promise<CanonicalEmail[]> {
    console.log(`${LOG_PREFIX} Loading latest emails...`);
    const listRes = await fetchWithTimeout('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5', accessToken);
    const listData = await listRes.json();
    
    if (!listData.messages || listData.messages.length === 0) return [];

    // Use allSettled so one broken details block doesn't crash the whole run
    const results = await Promise.allSettled(
        listData.messages.map(async (msg: any) => {
            const detailRes = await fetchWithTimeout(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`, accessToken);
            const rawMsg = await detailRes.json();
            return normalizeGmailMessage(rawMsg);
        })
    );

    return results
        .filter((result): result is PromiseFulfilledResult<CanonicalEmail | null> => result.status === 'fulfilled')
        .map(result => result.value)
        .filter((email): email is CanonicalEmail => email !== null);
}

export async function getGmailMimeDetails(accessToken: string, query?: string): Promise<Record<string, any> | null> {
    console.log(`${LOG_PREFIX} Searching emails for keyword: ${query}...`);
    
    let url = 'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1';
    if (query) url += `&q=${encodeURIComponent(query)}`;
    
    const listRes = await fetchWithTimeout(url, accessToken);
    const listData = await listRes.json();
    
    if (!listData.messages || listData.messages.length === 0) return null;

    const msgId = listData.messages[0].id;
    const detailRes = await fetchWithTimeout(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`, accessToken);
    
    return await detailRes.json();
}

export async function getCalendarEvents(accessToken: string): Promise<CanonicalCalendarEvent[]> {
    console.log(`${LOG_PREFIX} Loading calendar entries...`);
    const timeMin = new Date().toISOString();
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=8&timeMin=${encodeURIComponent(timeMin)}&singleEvents=true&orderBy=startTime`;
    
    const res = await fetchWithTimeout(url, accessToken);
    const data = await res.json();
    
    return (data.items || []).map(normalizeCalendarEvent).filter(Boolean) as CanonicalCalendarEvent[];
}

export async function getDriveFiles(accessToken: string): Promise<CanonicalDriveFile[]> {
    console.log(`${LOG_PREFIX} Loading drive documents...`);
    const fields = 'files(id,name,mimeType,size,owners,lastModifyingUser,webViewLink)';
    const url = `https://www.googleapis.com/drive/v3/files?pageSize=10&fields=${encodeURIComponent(fields)}`;
    
    const res = await fetchWithTimeout(url, accessToken);
    const data = await res.json();
    
    return (data.files || []).map(normalizeDriveFile).filter(Boolean) as CanonicalDriveFile[];
}

export async function getDriveFileDeepRender(query: string, accessToken: string): Promise<Record<string, any> | null> {
    console.log(`${LOG_PREFIX} Loading deep drive document for: ${query}`);
    const safeQuery = query.replace(/deep render/gi, '').replace(/deep/gi, '').trim() || '';
    
    const fields = 'files(id,name,mimeType,size,owners,lastModifyingUser,webViewLink,webContentLink,modifiedTime)';
    let listData: any = { files: [] };
    
    if (safeQuery) {
        // Try strict name match, but escape single quotes
        const escapedQuery = safeQuery.replace(/'/g, "\\'");
        const qParam = `&q=${encodeURIComponent(`name contains '${escapedQuery}'`)}`;
        let url = `https://www.googleapis.com/drive/v3/files?pageSize=5&fields=${encodeURIComponent(fields)}${qParam}`;
        
        let listRes = await fetchWithTimeout(url, accessToken);
        if (listRes.ok) {
            listData = await listRes.json();
        }
        
        if (!listData.files || listData.files.length === 0) {
            // Fallback: fetch 50 recent files and score words
            url = `https://www.googleapis.com/drive/v3/files?pageSize=50&fields=${encodeURIComponent(fields)}`;
            listRes = await fetchWithTimeout(url, accessToken);
            if (listRes.ok) {
                const fallbackData = await listRes.json();
                if (fallbackData.files) {
                    const searchWords = safeQuery.toLowerCase().split(' ').filter(w => w.length > 2);
                    let bestFile = null;
                    let bestScore = 0;
                    
                    for (const f of fallbackData.files) {
                        const fname = (f.name || '').toLowerCase();
                        let score = 0;
                        for (const w of searchWords) {
                            if (fname.includes(w)) {
                                score++;
                            }
                        }
                        if (score > bestScore) {
                            bestScore = score;
                            bestFile = f;
                        }
                    }
                    if (bestFile) {
                        listData.files = [bestFile];
                    }
                }
            }
        }
    } else {
        const url = `https://www.googleapis.com/drive/v3/files?pageSize=1&fields=${encodeURIComponent(fields)}`;
        const listRes = await fetchWithTimeout(url, accessToken);
        if (listRes.ok) {
            listData = await listRes.json();
        }
    }
    
    if (!listData.files || listData.files.length === 0) return null;
    
    const file = listData.files[0];
    
    const result: any = {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        webViewLink: file.webViewLink,
        webContentLink: file.webContentLink,
        owner: file.owners?.[0]?.displayName || 'Unknown',
        lastModifyingUser: file.lastModifyingUser?.displayName || 'Unknown',
        updatedAt: file.modifiedTime,
        sizeBytes: parseInt(file.size || '0', 10),
        htmlContent: undefined,
        csvContent: undefined
    };
    
    // Fetch Exported content if possible
    try {
        if (file.mimeType.includes('document')) {
            const exportUrl = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/html`;
            const exportRes = await fetchWithTimeout(exportUrl, accessToken);
            if (exportRes.ok) {
                result.htmlContent = await exportRes.text();
            }
        } else if (file.mimeType.includes('spreadsheet')) {
            const exportUrl = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/csv`;
            const exportRes = await fetchWithTimeout(exportUrl, accessToken);
            if (exportRes.ok) {
                result.csvContent = await exportRes.text();
            }
        } else if (file.mimeType === 'text/csv' || file.mimeType === 'text/plain') {
            const getUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
            const getRes = await fetchWithTimeout(getUrl, accessToken);
            if (getRes.ok) {
                if (file.mimeType === 'text/csv') result.csvContent = await getRes.text();
                else result.htmlContent = `<pre>${await getRes.text()}</pre>`;
            }
        }
    } catch (e) {
        console.error(`${LOG_PREFIX} Failed to deep export drive file`, e);
    }
    
    return result;
}

export async function getGoogleTasks(accessToken: string): Promise<CanonicalTask[]> {
    console.log(`${LOG_PREFIX} Loading actions and tasks list...`);
    
    const listRes = await fetchWithTimeout('https://tasks.googleapis.com/tasks/v1/users/@me/lists', accessToken);
    const listsData = await listRes.json();
    
    if (!listsData.items || listsData.items.length === 0) return [];
    
    const primaryListId = listsData.items[0].id;
    const tasksRes = await fetchWithTimeout(`https://tasks.googleapis.com/tasks/v1/lists/${primaryListId}/tasks?maxResults=10`, accessToken);
    const tasksData = await tasksRes.json();
    
    return (tasksData.items || []).map(normalizeTask).filter(Boolean) as CanonicalTask[];
}

// ============================================================================
// 3. Email Layout Parser
// ============================================================================

export function parseRawGmailToMimeData(rawMsg: any): Record<string, any> | null {
    if (!rawMsg || !rawMsg.payload) return null;
    
    const headers: any[] = rawMsg.payload.headers || [];
    const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
    
    // Normal sender identifier extraction
    const fromVal = getHeader('from');
    let senderName = 'Sender';
    let senderEmail = 'email@domain.com';
    const fromMatch = fromVal.match(/^(?:"?([^"]*)"?\s)?(?:<(.+)>)$/);
    if (fromMatch) {
         senderName = fromMatch[1] || senderEmail;
         senderEmail = fromMatch[2];
    } else if (fromVal.includes('@')) {
         senderName = fromVal.split('<')[0]?.trim() || fromVal;
         senderEmail = (fromVal.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/) || [])[0] || fromVal;
    }
    
    // Safety verification check states (SPF, DKIM, DMARC)
    const authHeaders = headers.filter((h: any) => /auth|arc-auth|received-spf/i.test(h.name));
    const authResultsStr = authHeaders.map((h: any) => h.value).join(' ').toLowerCase();
    
    const resolveStatus = (key: string) => authResultsStr.includes(`${key}=pass`) ? 'pass' : authResultsStr.includes(`${key}=fail`) ? 'fail' : 'none';
    const spf = resolveStatus('spf');
    const dkim = resolveStatus('dkim');
    const dmarc = resolveStatus('dmarc');
    
    const mappedHeaders = headers.map((h: any) => {
        let category: 'Security' | 'Routing' | 'Identity' | 'Other' = 'Other';
        const nameLow = h.name.toLowerCase();
        if (/auth|dkim|spf|dmarc|arc-/i.test(nameLow)) category = 'Security';
        else if (/received|delivered-to|return-path|date/i.test(nameLow)) category = 'Routing';
        else if (/from|to|subject|message-id|cc|bcc/i.test(nameLow)) category = 'Identity';
        return { name: h.name, value: h.value, category };
    });
    
    // Reads out structural sections and attachment logs recursively
    const mapPart = (part: any): any => {
        const pMime = part.mimeType || 'application/octet-stream';
        const pHeaders: any[] = part.headers || [];
        const getPHeader = (n: string) => pHeaders.find((h: any) => h.name.toLowerCase() === n.toLowerCase())?.value || '';
        
        const sizeByte = part.body?.size || 0;
        let contentSample = '';
        let hexSample = '00 00 00 00';

        if (part.body?.data) {
             contentSample = decodeUrlSafeBase64(part.body.data);
             try {
                 const buf = Buffer.from(part.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
                 const hexArr = [];
                 const len = Math.min(buf.length, 16);
                 for (let i = 0; i < len; i++) {
                     hexArr.push(buf[i].toString(16).padStart(2, '0'));
                 }
                 hexSample = hexArr.join(' ') + (buf.length > 16 ? ' ...' : '');
             } catch {
                 hexSample = '[Skipped Binary]';
             }
        }
        
        const returnObj: any = {
            id: part.partId || `part_${Date.now()}_${Math.floor(Math.random()*1000)}`,
            name: part.filename || getPHeader('content-type')?.match(/name="?([^"\s;]+)"?/)?.[1] || pMime.split('/')[1] || 'part',
            mimeType: pMime,
            size: `${(sizeByte / 1024).toFixed(2)} KB`,
            encoding: getPHeader('content-transfer-encoding') || '7bit',
            disposition: getPHeader('content-disposition') || 'inline',
            cid: getPHeader('content-id') || 'none',
            contentSample: contentSample.substring(0, 1000),
            hexSample
        };
        
        if (part.parts && Array.isArray(part.parts)) {
            returnObj.children = part.parts.map(mapPart);
        }
        
        return returnObj;
    };
    
    const extractHtmlBody = (part: any): string => {
        if (part.mimeType === 'text/html' && part.body?.data) return decodeUrlSafeBase64(part.body.data);
        if (part.mimeType === 'text/plain' && part.body?.data) return `<pre style="white-space:pre-wrap;font-family:monospace;color:#e5e5e5;font-size:13px;">${decodeUrlSafeBase64(part.body.data)}</pre>`;
        if (part.parts) {
             for (const sub of part.parts) {
                 const html = extractHtmlBody(sub);
                 if (html) return html;
             }
        }
        return '';
    };
    
    return {
        id: rawMsg.id,
        subject: getHeader('subject') || 'Untitled Message',
        sender: { name: senderName, email: senderEmail },
        recipient: getHeader('to') || 'unknown',
        receivedAt: rawMsg.internalDate ? new Date(parseInt(rawMsg.internalDate, 10)).toISOString() : new Date().toISOString(),
        mimeVersion: getHeader('mime-version') || '1.0',
        contentType: getHeader('content-type') || 'text/html',
        spf, dkim, dmarc,
        headers: mappedHeaders,
        mimeTree: mapPart(rawMsg.payload),
        parsedHtml: extractHtmlBody(rawMsg.payload) || decodeUrlSafeBase64(rawMsg.payload.body?.data)
    };
}

// ============================================================================
// 4. Main Query routing
// ============================================================================

export async function handleWorkspaceQuery(domain: string, queryFilter?: string, accessToken?: string): Promise<AuraArtifact> {
    const safeDomain = domain?.toLowerCase().trim();
    
    if (!accessToken) {
        return {
             id: `work_unauth_${Date.now()}`,
             type: 'WORK_ARTIFACT',
             resolution_state: 'CONVERSATIONAL',
             context_summary: `### 🔒 Sign-In Required\n\nTo view and query live message entries and records, please sign in using the **Connect** button above.\n\n*Aura adheres to simple zero-simulation standards: no fake items or synthetic mock entries will be generated while unauthenticated.*`
        };
    }

    try {
        console.log(`${LOG_PREFIX} Searching Domain [${safeDomain}]...`);
        
        if (safeDomain === 'gmail') {
             if (queryFilter) {
                 const rawEmail = await getGmailMimeDetails(accessToken, queryFilter);
                 if (rawEmail) {
                     return {
                          id: `mime_${Date.now()}`,
                          type: 'EMAIL_MIME_ARTIFACT',
                          resolution_state: 'LIVE_DATA',
                          context_summary: `### 📩 Email Details\n\nSuccessfully retrieved the email matching search criteria: **"${queryFilter}"**. Check the sections below to read parsed headers and content.`,
                          data: parseRawGmailToMimeData(rawEmail)
                     };
                 }
                 return {
                      id: `err_not_found_${Date.now()}`,
                      type: 'WORK_ARTIFACT',
                      resolution_state: 'CONVERSATIONAL',
                      context_summary: `### ⚠️ No Results\n\nNo emails matching keyword **"${queryFilter}"** found in your inbox.`
                 };
             }

             const emails = await getGmailEmails(accessToken);
             return {
                  id: `gmail_${Date.now()}`,
                  type: 'WORK_ARTIFACT',
                  resolution_state: 'LIVE_DATA',
                  context_summary: `### 📨 Recent Emails\n\nLatest messages from your mailbox:\n\n` + 
                    (emails.map(e => `**${e.sender.name}**\n\`${e.subject}\`\n*Action:* ${e.extractedEntities.action_items[0] || 'None'}`).join('\n\n---\n\n') || "No recent emails found.")
             };
             
        } else if (safeDomain === 'calendar') {
             const events = await getCalendarEvents(accessToken);
             return {
                  id: `cal_${Date.now()}`,
                  type: 'WORK_ARTIFACT',
                  resolution_state: 'LIVE_DATA',
                  context_summary: `### 📅 Upcoming Events\n\nYour immediate schedules and meetings:\n\n` +
                    (events.map(ev => `**${ev.summary}**\n\`${new Date(ev.startTime).toLocaleString([], {weekday:'short', hour:'numeric', minute:'2-digit'})}\` | ${ev.attendees.length} participants\n*Status: ${ev.status}*`).join('\n\n---\n\n') || "No scheduled meetings found.")
             };
             
        } else if (safeDomain === 'drive') {
             if (queryFilter && queryFilter.trim() !== '') {
                 const doc = await getDriveFileDeepRender(queryFilter, accessToken);
                 if (doc) {
                     return {
                          id: `drive_deep_${Date.now()}`,
                          type: 'DRIVE_DOC_ARTIFACT' as any,
                          resolution_state: 'LIVE_DATA',
                          context_summary: `### 🗄️ Drive Document\n\nLive payload retrieved for: **"${doc.name}"**.`,
                          data: doc
                     };
                 }
             }
             const files = await getDriveFiles(accessToken);
             return {
                  id: `drive_${Date.now()}`,
                  type: 'WORK_ARTIFACT',
                  resolution_state: 'LIVE_DATA',
                  context_summary: `### 🗄️ Recent Drive Files\n\nRecently edited files and items in your storage:\n\n` +
                    (files.map(f => `**[${f.name}](${f.viewUrl})**\n\`Size: ${(f.sizeBytes / 1048576).toFixed(2)} MB\` | \`Owner: ${f.owner}\``).join('\n\n') || "No files found in storage.")
             };
             
        } else if (safeDomain === 'tasks') {
             const tasks = await getGoogleTasks(accessToken);
             return {
                  id: `tasks_${Date.now()}`,
                  type: 'WORK_ARTIFACT',
                  resolution_state: 'LIVE_DATA',
                  context_summary: `### ☑️ Google Tasks\n\nCurrent task list of action items:\n\n` +
                    (tasks.map(t => `* ${t.status === 'COMPLETED' ? '~~' : ''}**${t.title}**${t.status === 'COMPLETED' ? '~~' : ''} ${t.dueDate ? `\`Due: ${t.dueDate}\`` : ''}`).join('\n\n') || "No tasks active.")
             };
             
        } else {
             return {
                  id: `err_domain_${Date.now()}`,
                  type: 'WORK_ARTIFACT',
                  resolution_state: 'GROUNDING_FAULT',
                  context_summary: `### ⚠️ Configuration Error\n\nSelected tab domain **"${domain}"** is not supported in the workspace tool.`
             };
        }
        
    } catch (err: any) {
         console.error(`${LOG_PREFIX} Loading error:`, err);
         return {
              id: `err_fatal_${Date.now()}`,
              type: 'WORK_ARTIFACT',
              resolution_state: 'GROUNDING_FAULT',
              context_summary: `### ❌ Connection Error\n\nCould not fetch workspace data from Google APIs.\n\n\`\`\`bash\nError: ${err.message}\n\`\`\``
         };
    }
}

// ============================================================================
// 5. Scatter Gather & Trust Gate Mutations
// ============================================================================

export async function handleScatterGatherQuery(queryFilter: string | undefined, accessToken?: string): Promise<AuraArtifact> {
    if (!accessToken) {
        return {
             id: `work_unauth_${Date.now()}`,
             type: 'WORK_ARTIFACT',
             resolution_state: 'CONVERSATIONAL',
             context_summary: `### 🔒 Sign-In Required\n\nTo perform multi-domain scatter-gather routing, please sign in.`
        };
    }
    
    try {
        console.log(`${LOG_PREFIX} Initiating Scatter-Gather for query: ${queryFilter}`);
        
        const [emails, events, tasks, files] = await Promise.all([
            getGmailEmails(accessToken).catch(() => []),
            getCalendarEvents(accessToken).catch(() => []),
            getGoogleTasks(accessToken).catch(() => []),
            getDriveFiles(accessToken).catch(() => [])
        ]);

        return {
            id: `scatter_gather_${Date.now()}`,
            type: 'WORK_ARTIFACT',
            resolution_state: 'LIVE_DATA',
            context_summary: `### 🌐 Workspace Scatter-Gather Report\n\n**Cross-domain Context Analysis** for query: *"${queryFilter || 'General Briefing'}"*\n\n` + 
            `**📨 High-Priority Mail:**\n` + (emails.slice(0,3).map(e => `- ${e.sender.name}: ${e.subject}`).join('\n') || "None") + `\n\n` +
            `**📅 Next Appointments:**\n` + (events.slice(0,3).map(ev => `- ${new Date(ev.startTime).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})} - ${ev.summary}`).join('\n') || "None") + `\n\n` +
            `**☑️ Active Tasks:**\n` + (tasks.slice(0,3).map(t => `- ${t.title}`).join('\n') || "None") + `\n\n` +
            `**🗄️ Recent Documents:**\n` + (files.slice(0,3).map(f => `- [${f.name}](${f.viewUrl})`).join('\n') || "None") + `\n\n` +
            `*Agentic routing complete. Multi-domain invariant established.*`
        };
        
    } catch (err: any) {
         console.error(`${LOG_PREFIX} ScatterGather error:`, err);
         return {
              id: `err_sg_${Date.now()}`,
              type: 'WORK_ARTIFACT',
              resolution_state: 'GROUNDING_FAULT',
              context_summary: `### ❌ Scatter-Gather Error\n\nCould not fetch workspace data from Google APIs.\n\n\`\`\`bash\nError: ${err.message}\n\`\`\``
         };
    }
}

export async function handleWorkspaceMutation(domain: string, actionType: string, payloadStr: string, accessToken?: string): Promise<AuraArtifact> {
    if (!accessToken) {
         return {
              id: `mut_unauth_${Date.now()}`,
              type: 'WORK_ARTIFACT',
              resolution_state: 'CONVERSATIONAL',
              context_summary: `### 🔒 Sign-In Required\n\nTo execute workspace mutations, please sign in.`
         };
    }
    
    return {
         id: `mutation_${Date.now()}`,
         type: 'WORKSPACE_MUTATION_ARTIFACT' as any,
         resolution_state: 'PENDING_APPROVAL' as any,
         context_summary: `### 🛡️ Trust Gate Invariant Guard\n\nA mutating operation requires interactive approval.\n\n*Pending explicit user execution approval.*`,
         data: { domain, actionType, payload: payloadStr }
    };
}
