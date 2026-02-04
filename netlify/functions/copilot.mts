import type { Context, Config } from "@netlify/functions";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: Netlify.env.get("ANTHROPIC_API_KEY"),
});

const PORTAL_BASE_URL = Netlify.env.get("PORTAL_BASE_URL") || "https://aas-portal.netlify.app";
const DROPLET_URL = Netlify.env.get("DROPLET_URL") || "http://134.199.203.192:8000";
const QDRANT_URL = Netlify.env.get("QDRANT_URL") || "http://134.199.203.192:6333";
const OPENAI_API_KEY = Netlify.env.get("OPENAI_API_KEY");
const LIMBLE_CLIENT_ID = Netlify.env.get("LIMBLE_CLIENT_ID");
const LIMBLE_CLIENT_SECRET = Netlify.env.get("LIMBLE_CLIENT_SECRET");

// Google Sheets IDs (set in Netlify env vars or use defaults)
const PARTS_SHEET_ID = Netlify.env.get("PARTS_SHEET_ID") || "1VEC9agWIuajszDSQrz3pyJ30a3Gz_P5KO-uLWIru9Hk";
const MANUALS_SHEET_ID = Netlify.env.get("MANUALS_SHEET_ID") || "1pDacinz2vl8nioHV_mmSGmokHVO7DnzXGyVPUO5_KPU";

const LIMBLE_BASE_URL = "https://api.limblecmms.com/v2";
function getLimbleAuth(): string {
  return "Basic " + btoa(`${LIMBLE_CLIENT_ID}:${LIMBLE_CLIENT_SECRET}`);
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_field_knowledge",
    description: "Search AAS field knowledge for troubleshooting tips, common mistakes, upsell opportunities, and decision guidance. Use this when techs need practical advice beyond what's in manuals - things like 'what else should I check', 'what should I quote', 'common gotchas'.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Describe the situation - symptoms, equipment, what you're trying to decide" },
        category: { type: "string", enum: ["troubleshooting", "upsell", "gotcha", "safety", "procedure"], description: "Filter by category (optional)" },
        manufacturer: { type: "string", description: "Filter by manufacturer (optional)" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_playbooks",
    description: "Search legacy playbooks. Use search_field_knowledge instead for better results.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query - error codes, procedures, symptoms, manufacturer names" },
        top_k: { type: "number", description: "Number of results (default 5)" }
      },
      required: ["query"]
    }
  },
  {
    name: "get_door_info",
    description: "Get door details from Door Registry including manufacturer, model, location, customer. Use door ID in AAS-XXX, FD-XXX, or Name format like MH-1.81",
    input_schema: {
      type: "object" as const,
      properties: {
        door_id: { type: "string", description: "Door ID (AAS-XXX, FD-XXX) or Name (MH-1.81)" }
      },
      required: ["door_id"]
    }
  },
  {
    name: "search_doors",
    description: "Search for doors by customer, location, or manufacturer",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search term (customer name, location, etc.)" },
        manufacturer: { type: "string", description: "Filter by manufacturer (horton, stanley, nabco, besam)" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_parts",
    description: "Search parts inventory by name, part number, or description",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Part number, name, or description to search for" },
        manufacturer: { type: "string", description: "Filter by manufacturer" }
      },
      required: ["query"]
    }
  },
  {
    name: "get_work_orders",
    description: "Get work orders from Limble CMMS. Can filter by status, date, technician, or asset.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["open", "completed", "all"], description: "Filter by status (default: open)" },
        date_filter: { type: "string", description: "Filter completed tasks by date: 'today', 'yesterday', 'this_week', 'this_month', or YYYY-MM-DD format" },
        asset_id: { type: "string", description: "Filter by asset/door ID" },
        user_id: { type: "string", description: "Filter by technician user ID" }
      }
    }
  },
  {
    name: "get_service_history",
    description: "Get service history for a specific door/asset from Limble",
    input_schema: {
      type: "object" as const,
      properties: {
        asset_id: { type: "string", description: "The asset/door ID to get history for" },
        days: { type: "number", description: "Number of days of history (default 365)" }
      },
      required: ["asset_id"]
    }
  },
  {
    name: "get_technicians",
    description: "Get list of technicians/users from Limble CMMS. Use to find userID for a technician by name.",
    input_schema: {
      type: "object" as const,
      properties: {
        name_filter: { type: "string", description: "Optional: filter by technician name (partial match)" }
      }
    }
  },
  {
    name: "search_manuals",
    description: "Search technical manuals database by manufacturer, controller, door type, or model. Returns links to PDF manuals in Google Drive.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search term - manufacturer, controller name, model, or door type" },
        manufacturer: { type: "string", description: "Filter by manufacturer (Horton, Stanley, Besam, BEA, etc.)" },
        door_type: { type: "string", description: "Filter by door type (Slide, Swing, Sensor, etc.)" },
        controller: { type: "string", description: "Filter by controller (MC521, 4190, iQ, etc.)" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_manuals_rag",
    description: "Search 2,200+ technical manuals using AI semantic search. Returns actual content excerpts with source citations. Use this for detailed technical questions about installation, troubleshooting, programming, wiring, specifications, and maintenance procedures. Can filter by manufacturer and door type.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Natural language search - describe what you're looking for" },
        manufacturer: { type: "string", description: "Filter by manufacturer: horton, stanley, besam, nabco, record, tormax" },
        door_type: { type: "string", description: "Filter by door type: slide, swing, folding, icu, fire, revolving" },
        limit: { type: "number", description: "Number of results (default 5, max 10)" }
      },
      required: ["query"]
    }
  },
  {
    name: "search_assets",
    description: "Search asset/door locations by name, ID, customer, or address. Use when tech asks 'where is door X', 'what doors at location Y', or needs to find a door by asset ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Asset ID, door name, location, customer name, or address" },
        customer: { type: "string", description: "Filter by customer/parent name (Manning, Ochsner, etc.)" }
      },
      required: ["query"]
    }
  }
];

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case "search_field_knowledge": {
        const query = input.query as string;
        const category = input.category as string | undefined;
        const manufacturer = input.manufacturer as string | undefined;
        
        if (!OPENAI_API_KEY) {
          return JSON.stringify({ error: "OpenAI API key not configured" });
        }
        
        try {
          // Get query embedding
          const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${OPENAI_API_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: "text-embedding-3-small",
              input: query
            })
          });
          
          if (!embeddingResponse.ok) {
            return JSON.stringify({ error: "Failed to generate embedding" });
          }
          
          const embeddingData = await embeddingResponse.json();
          const queryVector = embeddingData.data[0].embedding;
          
          // Build filter
          const mustFilters: any[] = [];
          if (category) {
            mustFilters.push({ key: "category", match: { value: category } });
          }
          if (manufacturer) {
            mustFilters.push({ key: "manufacturer", match: { value: manufacturer.toLowerCase() } });
          }
          
          const searchBody: any = {
            vector: queryVector,
            limit: 5,
            with_payload: true,
            score_threshold: 0.3
          };
          
          if (mustFilters.length > 0) {
            searchBody.filter = { must: mustFilters };
          }
          
          // Query playbooks_v2
          const qdrantResponse = await fetch(
            `${QDRANT_URL}/collections/playbooks_v2/points/search`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(searchBody)
            }
          );
          
          if (!qdrantResponse.ok) {
            return JSON.stringify({ error: "Field knowledge search unavailable" });
          }
          
          const results = await qdrantResponse.json();
          const hits = results.result || [];
          
          if (hits.length === 0) {
            return JSON.stringify({
              query,
              count: 0,
              message: "No field knowledge found for this situation.",
              entries: []
            });
          }
          
          // Format results
          const entries = hits.map((hit: any) => {
            const p = hit.payload || {};
            return {
              score: hit.score.toFixed(3),
              category: p.category,
              trigger: p.trigger,
              action: p.action,
              why: p.why,
              upsell: p.upsell,
              manufacturer: p.manufacturer,
              equipment: p.equipment,
              added_by: p.added_by
            };
          });
          
          return JSON.stringify({
            query,
            count: entries.length,
            entries
          });
          
        } catch (error) {
          return JSON.stringify({ error: "Field knowledge search failed" });
        }
      }

      case "search_playbooks": {
        const query = input.query as string;
        const top_k = (input.top_k as number) || 5;
        try {
          const response = await fetch(`${DROPLET_URL}/search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, top_k })
          });
          if (!response.ok) {
            return JSON.stringify({ error: "Playbook search unavailable", fallback: true });
          }
          return await response.text();
        } catch (e) {
          return JSON.stringify({ error: "Droplet unavailable", fallback: true });
        }
      }

      case "get_door_info": {
        const doorId = input.door_id as string;
        const response = await fetch(`${PORTAL_BASE_URL}/api/door?id=${encodeURIComponent(doorId)}`);
        if (!response.ok) return JSON.stringify({ error: `Door not found: ${doorId}` });
        return await response.text();
      }

      case "search_doors": {
        const query = input.query as string;
        const mfr = input.manufacturer as string | undefined;
        let url = `${PORTAL_BASE_URL}/api/search-index?q=${encodeURIComponent(query)}&type=doors`;
        if (mfr) url += `&manufacturer=${encodeURIComponent(mfr)}`;
        const response = await fetch(url);
        return await response.text();
      }

      case "search_parts": {
        let rawQuery = (input.query as string).toLowerCase().trim();
        const mfr = input.manufacturer as string | undefined;
        
        // Remove filler words
        const fillerWords = ['for', 'a', 'an', 'the', 'i', 'need', 'parts', 'part', 'find', 'get', 'order', 'quote'];
        const cleanedQuery = rawQuery.split(/\s+/).filter(w => !fillerWords.includes(w)).join(' ').trim();
        
        if (!cleanedQuery) {
          return JSON.stringify({ error: "Please provide a search term" });
        }
        
        if (!OPENAI_API_KEY) {
          return JSON.stringify({ error: "OpenAI API key not configured for parts search" });
        }
        
        try {
          // Step 1: Get query embedding
          const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${OPENAI_API_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: "text-embedding-3-small",
              input: cleanedQuery
            })
          });
          
          if (!embeddingResponse.ok) {
            return JSON.stringify({ error: "Failed to generate query embedding" });
          }
          
          const embeddingData = await embeddingResponse.json();
          const queryVector = embeddingData.data[0].embedding;
          
          // Step 2: Build Qdrant filter if manufacturer specified
          const filter: any = mfr ? {
            must: [{
              key: "manufacturer",
              match: { value: mfr.toLowerCase() }
            }]
          } : undefined;
          
          // Step 3: Search Qdrant parts_v1 collection
          const searchBody: any = {
            vector: queryVector,
            limit: 30,
            with_payload: true,
            score_threshold: 0.25
          };
          
          if (filter) {
            searchBody.filter = filter;
          }
          
          const qdrantResponse = await fetch(
            `${QDRANT_URL}/collections/parts_v1/points/search`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(searchBody)
            }
          );
          
          if (!qdrantResponse.ok) {
            // Fallback to CSV search if Qdrant unavailable
            return JSON.stringify({ 
              error: "Parts vector search unavailable", 
              suggestion: "Try searching with exact part number"
            });
          }
          
          const searchResults = await qdrantResponse.json();
          const hits = searchResults.result || [];
          
          if (hits.length === 0) {
            return JSON.stringify({
              query: cleanedQuery,
              count: 0,
              message: "No matching parts found. Try different keywords or check the part number.",
              parts: []
            });
          }
          
          // Step 4: Categorize results into tiers
          const queryWords = cleanedQuery.split(/\s+/).filter(w => w.length > 0);
          
          const tieredResults: {
            exact: any[];
            close: any[];
            partial: any[];
          } = { exact: [], close: [], partial: [] };
          
          for (const hit of hits) {
            const payload = hit.payload || {};
            const searchText = `${payload.mfg_part || ''} ${payload.description || ''} ${payload.manufacturer || ''}`.toLowerCase();
            
            // Count how many query words match
            let matchCount = 0;
            for (const word of queryWords) {
              if (searchText.includes(word)) {
                matchCount++;
              }
            }
            
            const result = {
              mfg_part: payload.mfg_part || null,
              aas_number: payload.aas_number || "",
              description: payload.description || "",
              manufacturer: payload.manufacturer || "",
              // Display format: MFG# (AAS#) - Description
              display: payload.mfg_part 
                ? `${payload.mfg_part} (${payload.aas_number}) - ${payload.description}`
                : `(${payload.aas_number}) - ${payload.description}`,
              image_url: payload.image_id 
                ? `https://drive.google.com/thumbnail?id=${payload.image_id}&sz=w400` 
                : null,
              score: hit.score.toFixed(3),
              match: `${matchCount}/${queryWords.length}`
            };
            
            // Tier based on match ratio
            const matchRatio = matchCount / queryWords.length;
            if (matchRatio === 1) {
              tieredResults.exact.push(result);
            } else if (matchRatio >= 0.5) {
              tieredResults.close.push(result);
            } else if (hit.score > 0.4) {
              tieredResults.partial.push(result);
            }
          }
          
          // Build response with tier info
          return JSON.stringify({
            query: cleanedQuery,
            queryWords: queryWords,
            manufacturerFilter: mfr || null,
            tiers: {
              exact: tieredResults.exact.length,
              close: tieredResults.close.length,
              partial: tieredResults.partial.length
            },
            exactMatches: tieredResults.exact,
            closeMatches: tieredResults.close,
            partialMatches: tieredResults.partial.slice(0, 10), // Limit partial
            count: tieredResults.exact.length + tieredResults.close.length + tieredResults.partial.length
          });
          
        } catch (error) {
          return JSON.stringify({ 
            error: "Failed to search parts", 
            details: error instanceof Error ? error.message : "Unknown error"
          });
        }
      }

      case "get_work_orders": {
        const status = (input.status as string) || "open";
        const dateFilter = input.date_filter as string | undefined;
        const assetId = input.asset_id as string | undefined;
        const userId = input.user_id as string | undefined;
        
        // Limble Status IDs:
        // 0 = Open
        // 1 = In Progress  
        // 2 = Complete
        // 2969 = Return/Quote for Parts (custom)
        // 3100 = Work Complete - Pending Confirmation (custom)
        const COMPLETED_STATUS_IDS = [2, 3100]; // statusID values that mean "completed"
        const OPEN_STATUS_IDS = [0, 1, 2969];   // statusID values that mean "open/in progress"
        
        // First, find the last page (binary search)
        const findLastPage = async (): Promise<number> => {
          let low = 1, high = 100, lastPage = 1;
          while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const resp = await fetch(`${LIMBLE_BASE_URL}/tasks?page=${mid}&limit=100`, { 
              headers: { Authorization: getLimbleAuth() } 
            });
            if (!resp.ok) break;
            const data = await resp.json();
            const tasks = Array.isArray(data) ? data : (data.data || data.tasks || []);
            if (tasks.length > 0) {
              lastPage = mid;
              low = mid + 1;
            } else {
              high = mid - 1;
            }
          }
          return lastPage;
        };
        
        // Find max page number
        const maxPage = await findLastPage();
        
        // Fetch tasks in REVERSE order (newest first) - start from last page
        let allTasks: any[] = [];
        const pagesToFetch = Math.min(maxPage, 50); // Fetch up to 50 pages
        
        for (let page = maxPage; page >= Math.max(1, maxPage - pagesToFetch + 1); page--) {
          const url = `${LIMBLE_BASE_URL}/tasks?page=${page}&limit=100`;
          const response = await fetch(url, { headers: { Authorization: getLimbleAuth() } });
          if (!response.ok) continue;
          
          const data = await response.json();
          const tasks = Array.isArray(data) ? data : (data.data || data.tasks || []);
          allTasks = allTasks.concat(tasks);
        }
        
        // SORT BY dateCompleted DESCENDING (most recent first)
        allTasks.sort((a: any, b: any) => {
          const aDate = a.dateCompleted || 0;
          const bDate = b.dateCompleted || 0;
          return bDate - aDate; // Descending order
        });
        
        let tasks = allTasks;
        
        // Helper: Get start of day in Central Time (Unix seconds)
        const getDateRangeUnix = (filter: string): { start: number; end: number } | null => {
          const centralNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
          const year = centralNow.getFullYear();
          const month = centralNow.getMonth();
          const day = centralNow.getDate();
          
          let startDate: Date;
          let endDate: Date;
          
          if (filter === 'today') {
            startDate = new Date(year, month, day, 0, 0, 0);
            endDate = new Date(year, month, day, 23, 59, 59);
          } else if (filter === 'yesterday') {
            startDate = new Date(year, month, day - 1, 0, 0, 0);
            endDate = new Date(year, month, day - 1, 23, 59, 59);
          } else if (filter === 'this_week') {
            const dayOfWeek = centralNow.getDay();
            startDate = new Date(year, month, day - dayOfWeek, 0, 0, 0);
            endDate = new Date(year, month, day, 23, 59, 59);
          } else if (filter === 'this_month') {
            startDate = new Date(year, month, 1, 0, 0, 0);
            endDate = new Date(year, month, day, 23, 59, 59);
          } else if (/^\d{4}-\d{2}-\d{2}$/.test(filter)) {
            // Specific date YYYY-MM-DD
            const [y, m, d] = filter.split('-').map(Number);
            startDate = new Date(y, m - 1, d, 0, 0, 0);
            endDate = new Date(y, m - 1, d, 23, 59, 59);
          } else {
            return null;
          }
          
          return {
            start: Math.floor(startDate.getTime() / 1000),
            end: Math.floor(endDate.getTime() / 1000)
          };
        };
        
        // Helper: Check if task is completed by statusID
        const isCompleted = (t: any) => COMPLETED_STATUS_IDS.includes(t.statusID);
        const isOpen = (t: any) => OPEN_STATUS_IDS.includes(t.statusID) || t.statusID === undefined;
        
        // Calculate stats before filtering
        const now = Math.floor(Date.now() / 1000);
        const oneYearAgoUnix = now - (365 * 24 * 60 * 60);
        const totalTasks = tasks.length;
        
        // Use statusID for completion status
        const completedThisYear = tasks.filter((t: any) => 
          isCompleted(t) && t.dateCompleted && t.dateCompleted >= oneYearAgoUnix
        ).length;
        const openTasks = tasks.filter((t: any) => isOpen(t)).length;
        
        // Get today's range for "completed today" stat
        const todayRange = getDateRangeUnix('today');
        const completedToday = todayRange ? tasks.filter((t: any) => 
          isCompleted(t) && t.dateCompleted && t.dateCompleted >= todayRange.start && t.dateCompleted <= todayRange.end
        ).length : 0;
        
        if (status === "open") {
          // Open = statusID is 0, 1, or 2969
          tasks = tasks.filter((t: any) => isOpen(t));
        } else if (status === "completed") {
          // Completed = statusID is 2 or 3100
          tasks = tasks.filter((t: any) => isCompleted(t));
          
          // Then apply date filter if provided
          if (dateFilter) {
            const range = getDateRangeUnix(dateFilter);
            if (range) {
              tasks = tasks.filter((t: any) => 
                t.dateCompleted && t.dateCompleted >= range.start && t.dateCompleted <= range.end
              );
            }
          } else {
            // Default: last 7 days
            const sevenDaysAgoUnix = now - (7 * 24 * 60 * 60);
            tasks = tasks.filter((t: any) => t.dateCompleted && t.dateCompleted >= sevenDaysAgoUnix);
          }
        }
        // status === "all" means no status filtering, but still apply date filter if present
        else if (status === "all" && dateFilter) {
          const range = getDateRangeUnix(dateFilter);
          if (range) {
            tasks = tasks.filter((t: any) => {
              if (isCompleted(t) && t.dateCompleted) {
                return t.dateCompleted >= range.start && t.dateCompleted <= range.end;
              }
              // For open tasks, include them all (or check creation date if available)
              return true;
            });
          }
        }
        
        // Filter by asset if provided
        if (assetId) {
          tasks = tasks.filter((t: any) => String(t.assetID) === assetId);
        }
        
        // Filter by user if provided
        if (userId) {
          tasks = tasks.filter((t: any) => 
            String(t.userID) === userId || String(t.completedByUser) === userId
          );
        }
        
        // Convert Unix timestamps to readable dates
        const formatDate = (unix: number) => {
          if (!unix || unix === 0) return null;
          return new Date(unix * 1000).toLocaleDateString('en-US', { 
            month: 'short', day: 'numeric', year: 'numeric',
            timeZone: 'America/Chicago'
          });
        };
        
        // Map statusID to human-readable name
        const getStatusName = (statusID: number): string => {
          const statusMap: { [key: number]: string } = {
            0: 'Open',
            1: 'In Progress',
            2: 'Complete',
            2969: 'Return/Quote for Parts',
            3100: 'Work Complete - Pending'
          };
          return statusMap[statusID] || `Unknown (${statusID})`;
        };
        
        // Return summary with key fields (sorted by dateCompleted descending)
        const summary = tasks.slice(0, 50).map((t: any) => ({
          taskID: t.taskID,
          name: t.name,
          status: getStatusName(t.statusID),
          statusID: t.statusID,
          description: t.description,
          assetID: t.assetID,
          locationID: t.locationID,
          userID: t.userID,
          teamID: t.teamID,
          priority: t.priority,
          due: formatDate(t.due),
          dateCompleted: formatDate(t.dateCompleted),
          completedByUser: t.completedByUser,
          completionNotes: t.completionNotes ? t.completionNotes.substring(0, 200) : null
        }));
        
        return JSON.stringify({ 
          stats: {
            totalTasksInSystem: totalTasks,
            totalPagesInLimble: maxPage,
            completedThisYear: completedThisYear,
            completedToday: completedToday,
            currentlyOpen: openTasks
          },
          filtered: {
            status: status,
            dateFilter: dateFilter || null,
            count: tasks.length,
            showing: summary.length
          },
          tasks: summary 
        });
      }

      case "get_service_history": {
        const assetId = input.asset_id as string;
        const days = (input.days as number) || 365;
        const startDateUnix = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
        
        // Fetch all tasks and filter for this asset's completed work
        const url = `${LIMBLE_BASE_URL}/tasks`;
        const response = await fetch(url, { headers: { Authorization: getLimbleAuth() } });
        if (!response.ok) return JSON.stringify({ error: "Failed to fetch service history" });
        
        const allTasks = await response.json();
        let tasks = Array.isArray(allTasks) ? allTasks : (allTasks.data || allTasks.tasks || []);
        
        // Filter to completed tasks for this asset within date range
        const filtered = tasks.filter((t: any) => {
          if (String(t.assetID) !== assetId) return false;
          if (!t.dateCompleted || t.dateCompleted === 0) return false;
          return t.dateCompleted >= startDateUnix;
        });
        
        const formatDate = (unix: number) => {
          if (!unix || unix === 0) return null;
          return new Date(unix * 1000).toLocaleDateString('en-US', { 
            month: 'short', day: 'numeric', year: 'numeric',
            timeZone: 'America/Chicago'
          });
        };
        
        const summary = filtered.slice(0, 30).map((t: any) => ({
          taskID: t.taskID,
          name: t.name,
          dateCompleted: formatDate(t.dateCompleted),
          completedByUser: t.completedByUser,
          completionNotes: t.completionNotes
        }));
        
        return JSON.stringify({ 
          assetID: assetId, 
          daysSearched: days,
          count: filtered.length,
          history: summary 
        });
      }

      case "get_technicians": {
        const nameFilter = (input.name_filter as string || "").toLowerCase();
        
        // Fetch users from Limble
        const url = `${LIMBLE_BASE_URL}/users`;
        const response = await fetch(url, { headers: { Authorization: getLimbleAuth() } });
        if (!response.ok) return JSON.stringify({ error: "Failed to fetch technicians" });
        
        const allUsers = await response.json();
        let users = Array.isArray(allUsers) ? allUsers : (allUsers.data || allUsers.users || []);
        
        // Filter by name if provided
        if (nameFilter) {
          users = users.filter((u: any) => {
            const fullName = `${u.firstName || ''} ${u.lastName || ''} ${u.name || ''}`.toLowerCase();
            return fullName.includes(nameFilter);
          });
        }
        
        // Return summary
        const summary = users.slice(0, 50).map((u: any) => ({
          userID: u.userID || u.id,
          name: u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim(),
          email: u.email,
          role: u.role || u.roleName
        }));
        
        return JSON.stringify({
          count: users.length,
          showing: summary.length,
          technicians: summary
        });
      }

      case "search_manuals": {
        const query = (input.query as string).toLowerCase();
        const mfrFilter = input.manufacturer as string | undefined;
        const doorTypeFilter = input.door_type as string | undefined;
        const controllerFilter = input.controller as string | undefined;
        
        // Check if manuals sheet is configured
        if (!MANUALS_SHEET_ID) {
          return JSON.stringify({ error: "Manuals database not configured. Set MANUALS_SHEET_ID in Netlify environment variables." });
        }
        
        // Manuals database in Google Sheet
        // Columns: Manufacturer, ProductLine, DoorType, Controller, Model, FileName, DriveLink, Tags, etc.
        const MANUALS_CSV_URL = `https://docs.google.com/spreadsheets/d/${MANUALS_SHEET_ID}/export?format=csv`;
        
        try {
          const response = await fetch(MANUALS_CSV_URL);
          if (!response.ok) {
            return JSON.stringify({ error: "Failed to fetch manuals database - check sheet ID and permissions", status: response.status });
          }
          
          const csvText = await response.text();
          const lines = csvText.split('\n');
          
          if (lines.length < 2) {
            return JSON.stringify({ error: "Manuals sheet is empty or invalid" });
          }
          
          // Parse CSV header - exact columns from AAS manuals sheet:
          // Manufacturer, ProductLine, DoorType, Controller, Model, FileName, DriveLink, Tags, DoorType_Final, Controller_Auto, Model_Auto
          const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
          
          // Find exact matches first, then partial
          const findCol = (exact: string, partial?: string) => {
            let idx = headers.indexOf(exact);
            if (idx === -1 && partial) idx = headers.findIndex(h => h.includes(partial));
            return idx;
          };
          
          const mfrCol = findCol('manufacturer');
          const productCol = findCol('productline');
          const doorTypeCol = findCol('doortype_final', 'doortype');
          const controllerCol = findCol('controller');
          const modelCol = findCol('model');
          const fileCol = findCol('filename');
          const linkCol = findCol('drivelink');
          const tagsCol = findCol('tags');
          
          const results: any[] = [];
          
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim()) continue;
            
            // Parse CSV
            const values: string[] = [];
            let current = '';
            let inQuotes = false;
            for (const char of line) {
              if (char === '"') {
                inQuotes = !inQuotes;
              } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
              } else {
                current += char;
              }
            }
            values.push(current.trim());
            
            const manufacturer = mfrCol >= 0 ? values[mfrCol] || '' : '';
            const productLine = productCol >= 0 ? values[productCol] || '' : '';
            const doorType = doorTypeCol >= 0 ? values[doorTypeCol] || '' : '';
            const controller = controllerCol >= 0 ? values[controllerCol] || '' : '';
            const model = modelCol >= 0 ? values[modelCol] || '' : '';
            const fileName = fileCol >= 0 ? values[fileCol] || '' : '';
            const driveLink = linkCol >= 0 ? values[linkCol] || '' : '';
            const tags = tagsCol >= 0 ? values[tagsCol] || '' : '';
            
            // Build search text
            const searchText = `${manufacturer} ${productLine} ${doorType} ${controller} ${model} ${fileName} ${tags}`.toLowerCase();
            
            // Tokenized search: check if ALL query words appear (with synonyms)
            const manualSynonyms: Record<string, string[]> = {
              'manual': ['guide', 'instructions', 'handbook'],
              'guide': ['manual', 'instructions'],
              'install': ['installation', 'setup'],
              'installation': ['install', 'setup'],
              'service': ['maintenance', 'repair'],
              'maintenance': ['service', 'repair'],
              'slide': ['slider', 'sliding'],
              'slider': ['slide', 'sliding'],
              'swing': ['swinging'],
              'fold': ['folding', 'bifold']
            };
            
            const queryWords = query.split(/\s+/).filter(w => w.length > 0);
            let matchCount = 0;
            
            for (const word of queryWords) {
              if (searchText.includes(word)) {
                matchCount++;
              } else {
                // Check synonyms
                const synonyms = manualSynonyms[word] || [];
                if (synonyms.some(syn => searchText.includes(syn))) {
                  matchCount++;
                }
              }
            }
            
            // Require at least half the words to match, or all if 2 or fewer words
            const minRequired = queryWords.length <= 2 ? queryWords.length : Math.ceil(queryWords.length / 2);
            if (matchCount < minRequired) continue;
            
            // Apply filters
            if (mfrFilter && !manufacturer.toLowerCase().includes(mfrFilter.toLowerCase())) continue;
            if (doorTypeFilter && !doorType.toLowerCase().includes(doorTypeFilter.toLowerCase())) continue;
            if (controllerFilter && !controller.toLowerCase().includes(controllerFilter.toLowerCase())) continue;
            
            results.push({
              manufacturer,
              productLine,
              doorType,
              controller,
              model,
              fileName,
              driveLink: driveLink || null,
              tags,
              matchScore: matchCount
            });
          }
          
          // Sort by match score descending
          results.sort((a: any, b: any) => (b.matchScore || 0) - (a.matchScore || 0));
          
          // Remove matchScore from output and limit to 30
          const finalResults = results.slice(0, 30).map(({ matchScore, ...rest }: any) => rest);
          
          return JSON.stringify({
            query,
            filters: { manufacturer: mfrFilter, doorType: doorTypeFilter, controller: controllerFilter },
            count: finalResults.length,
            manuals: finalResults
          });
          
        } catch (error) {
          return JSON.stringify({ 
            error: "Failed to search manuals", 
            details: error instanceof Error ? error.message : "Unknown error"
          });
        }
      }

      case "search_manuals_rag": {
        const query = input.query as string;
        const manufacturer = input.manufacturer as string | undefined;
        const doorType = input.door_type as string | undefined;
        const limit = Math.min((input.limit as number) || 5, 10);

        try {
          // Call Door Guru V3 API
          const response = await fetch(`${DROPLET_URL}/search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, top_k: limit })
          });

          if (!response.ok) {
            return JSON.stringify({
              error: "Door Guru V3 search unavailable",
              status: response.status
            });
          }

          const data = await response.json();
          const manualResults = data.manual_results || [];
          const playbookResults = data.playbook_results || [];

          // Apply client-side filters if specified
          let filteredManuals = manualResults;
          if (manufacturer) {
            filteredManuals = filteredManuals.filter((r: any) =>
              (r.manufacturer || "").toLowerCase().includes(manufacturer.toLowerCase())
            );
          }
          if (doorType) {
            filteredManuals = filteredManuals.filter((r: any) => {
              const doorTypes = r.door_types || [];
              return doorTypes.some((dt: string) => dt.toLowerCase().includes(doorType.toLowerCase()));
            });
          }

          if (filteredManuals.length === 0 && playbookResults.length === 0) {
            return JSON.stringify({
              query: query,
              filters: { manufacturer, door_type: doorType },
              count: 0,
              message: "No matching documentation found. Try broadening your search or removing filters.",
              manual_results: [],
              playbook_results: []
            });
          }

          // Format manual results
          const formattedManuals = filteredManuals.slice(0, limit).map((hit: any, index: number) => ({
            rank: index + 1,
            score: hit.score ? hit.score.toFixed(3) : null,
            manufacturer: hit.manufacturer || "unknown",
            model: hit.model || null,
            manual_type: hit.manual_type || null,
            source: hit.doc_key || hit.source || "unknown",
            drive_link: hit.drive_link || null,
            controllers: hit.controllers || [],
            door_types: hit.door_types || [],
            text: hit.text || ""
          }));

          // Format playbook results (AAS tribal knowledge / field tips)
          const formattedPlaybooks = playbookResults.slice(0, 3).map((hit: any, index: number) => ({
            rank: index + 1,
            score: hit.score ? hit.score.toFixed(3) : null,
            category: hit.category || null,
            trigger: hit.trigger || null,
            action: hit.action || null,
            why: hit.why || null,
            manufacturer: hit.manufacturer || null,
            equipment: hit.equipment || null
          }));

          return JSON.stringify({
            query: query,
            filters: { manufacturer, door_type: doorType },
            count: formattedManuals.length,
            manual_results: formattedManuals,
            playbook_results: formattedPlaybooks,
            playbook_count: formattedPlaybooks.length
          });

        } catch (error) {
          return JSON.stringify({
            error: "Failed to search Door Guru V3",
            details: error instanceof Error ? error.message : "Unknown error"
          });
        }
      }

      case "search_assets": {
        const query = (input.query as string).toLowerCase().trim();
        const customerFilter = input.customer as string | undefined;
        
        if (!query) {
          return JSON.stringify({ error: "Please provide a search term" });
        }
        
        if (!OPENAI_API_KEY) {
          return JSON.stringify({ error: "OpenAI API key not configured" });
        }
        
        try {
          // Get query embedding
          const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${OPENAI_API_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: "text-embedding-3-small",
              input: query
            })
          });
          
          if (!embeddingResponse.ok) {
            return JSON.stringify({ error: "Failed to generate query embedding" });
          }
          
          const embeddingData = await embeddingResponse.json();
          const queryVector = embeddingData.data[0].embedding;
          
          // Build Qdrant filter
          const filter: any = customerFilter ? {
            must: [{
              key: "parent_asset_name",
              match: { value: customerFilter.toLowerCase() }
            }]
          } : undefined;
          
          // Search Qdrant assets_v1
          const searchBody: any = {
            vector: queryVector,
            limit: 20,
            with_payload: true,
            score_threshold: 0.3
          };
          
          if (filter) {
            searchBody.filter = filter;
          }
          
          const qdrantResponse = await fetch(
            `${QDRANT_URL}/collections/assets_v1/points/search`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(searchBody)
            }
          );
          
          if (!qdrantResponse.ok) {
            return JSON.stringify({ 
              error: "Asset search unavailable",
              suggestion: "Try get_door_info with a specific door ID"
            });
          }
          
          const searchResults = await qdrantResponse.json();
          const hits = searchResults.result || [];
          
          if (hits.length === 0) {
            return JSON.stringify({
              query: query,
              count: 0,
              message: "No matching assets found",
              assets: []
            });
          }
          
          const results = hits.map((hit: any) => {
            const p = hit.payload || {};
            return {
              asset_id: p.asset_id || "",
              asset_name: p.asset_name || "",
              door_id: p.door_id || "",
              door_location: p.door_location || "",
              parent_name: p.parent_asset_name || "",
              address: p.address || "",
              model: p.model || "",
              manufacturer: p.manufacturer || "",
              phone: p.phone || "",
              display: p.display || p.asset_name,
              score: hit.score.toFixed(3)
            };
          });
          
          return JSON.stringify({
            query: query,
            customerFilter: customerFilter || null,
            count: results.length,
            assets: results
          });
          
        } catch (error) {
          return JSON.stringify({ 
            error: "Failed to search assets", 
            details: error instanceof Error ? error.message : "Unknown error"
          });
        }
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (error) {
    return JSON.stringify({ error: `Tool failed: ${error instanceof Error ? error.message : "Unknown"}` });
  }
}

function getCurrentDate(): string {
  return new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    timeZone: 'America/Chicago'
  });
}

const SYSTEM_PROMPT_BASE = `You are the AAS Technical Copilot for Automatic Access Solutions LLC.

## TODAY'S DATE
{{CURRENT_DATE}}

## CORE RULES
1. You have access to AAS data via tools — USE THEM.
2. Never claim you "don't have access." If something isn't found, say: "No matching records found in the system for that query."
3. Never hallucinate. If sources are missing, ask for the exact controller/connector label.
4. Always cite sources for technical claims (manual + link).

## TOOL ROUTING (STRICT)
- **Tasks/work orders** → get_work_orders immediately
- **Door-specific** → get_door_info or search_doors
- **Asset/door location** → search_assets (where is X, doors at Y, asset ID lookup)
- **Parts** → search_parts
- **Technical HOW-TO / wiring / programming / error codes / pinouts** → search_manuals_rag FIRST
- **Decision support / gotchas / upsell** → search_field_knowledge
- **Manual PDF links** → search_manuals

## PARTS SEARCH TRIGGERS (USE search_parts FOR THESE)
Always use search_parts when user mentions:
- Part numbers (C5639, K5656, etc.)
- "part for", "part number", "I need", "order", "quote", "replace"
- Physical components: bottom guide, top roller, carrier, motor, belt, pulley, bearing, track, cap, wheel, arm, bracket, sensor, switch, board
- Manufacturer + model + component (e.g., "horton 2003 belt", "besam carrier")

**DO NOT confuse with manuals:**
- "bottom guide" = PART (search_parts)
- "installation guide" = MANUAL (search_manuals_rag)
- "horton 2003 slider parts" = PARTS
- "how to install horton 2003" = MANUAL

## PARTS SEARCH RESPONSE FORMAT
Parts search returns tiered results:
- **exactMatches**: All query words found - show these first
- **closeMatches**: Most words found - show if no exact
- **partialMatches**: Some words found - ask for clarification

**Display format:** MFG# (AAS#) - Description
- MFG# = Manufacturer part number (matches manuals)
- AAS# = Internal number for Limble ordering

**Response rules:**
1. If exactMatches > 0: List exact matches, mention close matches exist
2. If only closeMatches: Show them, ask "Did you mean X or Y?"
3. If only partialMatches: Ask for clarification before listing
4. Always include AAS# so tech can find in Limble
5. If part has image_url, include it on its own line so it displays as an image

## PINOUT / TABLE EXTRACTION MODE (MANDATORY)
**Trigger when user asks:** pinout, CNx/Jx/TBx, "terminal block", "1–12", "functions", wiring terminals.

**Steps:**
1. Call search_manuals_rag with a table-targeted query (include connector name + "terminal block" + numbers)
2. Output a numbered list exactly as the manual labels it
3. Include Source: doc_key + manual link

**If not found:** Say "Pinout table not found in retrieved chunks." Ask for connector label.

## ERROR CODE MODE (MANDATORY)
**Trigger when user asks:** error code, fault code, diagnostic code, "E-XX", "error XX"

**Steps:**
1. Retrieve error code table first via search_manuals_rag
2. Respond with: **Code → Meaning → Likely causes → First checks**
3. Cite manual source

## QUERY REWRITE RULES (for search_manuals_rag)
Rewrite user queries into high-recall strings. Include manufacturer/model when known from context.

**Examples:**
- "pinout for control" → "Horton C4190 CN1 terminal block 1 2 3 4 5 6 7 8 9 10 11 12 pinout"
- "StpNR'sum StopNSeek" → "C4190 StpNR'sum StopNSeek CN1 terminals function"
- "MC521 obstruction" → "Stanley MC521 obstruction error code table"
- "door won't close" → "[manufacturer] [model] door not closing troubleshooting"

## TOOL FALLBACK ORDERING
If search_manuals_rag returns no results:
1. Try once more with rewritten query using synonyms
2. Then call search_manuals to return best manual link(s)
3. Then say "No matching content found" and ask for controller label or exact term

## YOUR TOOLS
1. **search_manuals_rag** - Searches BOTH canonical (v2) and archive (v1) collections in parallel, merges by best score. Returns actual content excerpts with drive links.
2. **search_field_knowledge** - AAS team's field wisdom: troubleshooting tips, upsell opportunities, common mistakes
3. **search_manuals** - Search for PDF links by manufacturer, controller, door type
4. **search_parts** - Parts inventory (Addison# in 'key' column, MFG# in 'mfg_part' column)
5. **get_work_orders** - Tasks from Limble
6. **get_technicians** - List techs with userIDs
7. **get_service_history** - Service records for a door
8. **get_door_info** - Door details by ID
9. **search_doors** - Find doors by customer/location

## SOURCE HIERARCHY
- **Manufacturer manuals** = authority for wiring/specs/pinouts
- **Field knowledge** = practical experience and best practices

## RESPONSE TEMPLATES

**Technical How-To:**
1. [Step]
2. [Step]
3. [Step]

**Notes:** [1-3 bullets if needed]
**Source:** [Manual Name](drive_link)

**Pinout Response:**
**Connector: CNx**
1. [Function]
2. [Function]
...
**Source:** [Manual Name](drive_link)

**Error Code Response:**
**Code XX** → [Meaning]
- Likely causes: [list]
- First checks: [list]
**Source:** [Manual Name](drive_link)

## RESPONSE STYLE
- BE CONCISE - Techs are on mobile
- ANSWER DIRECTLY - No preamble, no "Great question!"
- NUMBERED STEPS for procedures
- ALWAYS include manual link when quoting technical content
- Format links as: [Manufacturer Model Manual](drive_link)
- If field knowledge + manual both apply, lead with manual, then add field experience

## COMPANY CONTEXT
- Louisiana-based, 700+ customer locations
- Healthcare: Manning, Ochsner
- Door IDs: AAS-XXX, FD-XXX, Names like MH-1.81
- Tech IDs: Ruben=265672, Jonas=266967, Sean=361996`;

interface Message { role: "user" | "assistant"; content: string; }
interface CopilotRequest {
  messages: Message[];
  doorId?: string;
  doorContext?: { manufacturer?: string; model?: string; location?: string; customer?: string; };
  technicianId?: string;
}

export default async function handler(req: Request, context: Context): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body: CopilotRequest = await req.json();
    if (!body.messages?.length) {
      return new Response(JSON.stringify({ error: "Messages required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let systemPrompt = SYSTEM_PROMPT_BASE.replace('{{CURRENT_DATE}}', getCurrentDate());
    if (body.doorId || body.doorContext) {
      systemPrompt += "\n\n## CURRENT CONTEXT";
      if (body.doorId) systemPrompt += `\nDoor ID: ${body.doorId}`;
      if (body.doorContext?.manufacturer) systemPrompt += `\nManufacturer: ${body.doorContext.manufacturer}`;
      if (body.doorContext?.model) systemPrompt += `\nModel: ${body.doorContext.model}`;
      if (body.doorContext?.location) systemPrompt += `\nLocation: ${body.doorContext.location}`;
      if (body.doorContext?.customer) systemPrompt += `\nCustomer: ${body.doorContext.customer}`;
    }

    const messages: Anthropic.MessageParam[] = body.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: systemPrompt,
      tools: TOOLS,
      tool_choice: { type: "auto" },
      messages,
    });

    let iterations = 0;
    let toolsUsed = false;
    const toolCalls: { name: string; input: any; result: string }[] = [];
    
    while (response.stop_reason === "tool_use" && iterations < 5) {
      iterations++;
      toolsUsed = true;

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        const result = await executeTool(toolUse.name, toolUse.input as Record<string, unknown>);
        toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: result });
        
        // Track for debug output
        toolCalls.push({
          name: toolUse.name,
          input: toolUse.input,
          result: result.length > 500 ? result.substring(0, 500) + "... (truncated)" : result
        });
      }

      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });

      try {
        response = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2048,
          system: systemPrompt,
          tools: TOOLS,
          messages,
        });
      } catch (apiError) {
        console.error("Claude API error during tool loop:", apiError);
        // Return partial response with what we have so far
        return new Response(
          JSON.stringify({
            response: "I gathered information but encountered an error synthesizing the response. Here's what I found in my tools - please check the browser console for details.",
            toolsUsed,
            toolCalls,
            iterations,
            error: apiError instanceof Error ? apiError.message : "API error"
          }),
          { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
        );
      }
    }

    const textBlocks = response.content.filter(
      (block): block is Anthropic.TextBlock => block.type === "text"
    );
    
    // Handle case where no text response (shouldn't happen but safety check)
    const responseText = textBlocks.length > 0 
      ? textBlocks.map((b) => b.text).join("\n")
      : "I processed your request but couldn't generate a text response. Check the tool results in the browser console.";

    const latestUserMsg = body.messages.filter((m) => m.role === "user").pop()?.content || "";
    const manufacturer = detectManufacturer(latestUserMsg + " " + responseText) || body.doorContext?.manufacturer;

    return new Response(
      JSON.stringify({
        response: responseText,
        manufacturer,
        toolsUsed,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        iterations,
        usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      }
    );
  } catch (error) {
    console.error("Copilot error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process request", details: error instanceof Error ? error.message : "Unknown" }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
}

function detectManufacturer(text: string): string | undefined {
  const lower = text.toLowerCase();
  if (/index\s*\d{1,2}|fis|duraglide|duracare|mc521|stanley|magic-swing/.test(lower)) return "stanley";
  if (/p\d{2}|double-click set|toggle switch|c3150|c4190|horton|series 2000/.test(lower)) return "horton";
  if (/handy terminal|u30|opus|nabco|gyro|gt[- ]?\d{3,4}/.test(lower)) return "nabco";
  if (/sl500|sw200|unislide|swingmaster|besam|assa abloy/.test(lower)) return "besam";
  return undefined;
}

export const config: Config = { path: "/api/copilot" };
