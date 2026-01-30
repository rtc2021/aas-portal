import type { Context, Config } from "@netlify/functions";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: Netlify.env.get("ANTHROPIC_API_KEY"),
});

const PORTAL_BASE_URL = Netlify.env.get("PORTAL_BASE_URL") || "https://aas-portal.netlify.app";
const DROPLET_URL = Netlify.env.get("DROPLET_URL") || "http://134.199.203.192:8000";
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
    name: "search_playbooks",
    description: "Search technical manuals and playbooks for troubleshooting info, error codes, procedures, wiring diagrams, and specifications. Use this for ANY technical question about door systems.",
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
    description: "Search technical manuals database by manufacturer, controller, door type, or model. Returns links to PDF manuals.",
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
  }
];

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
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
        const query = (input.query as string).toLowerCase();
        const mfr = input.manufacturer as string | undefined;
        
        // Parts data is in Google Sheet
        // Columns: key, manufacturer, mfg_part, description, image_path, qr_payload, match_status, image_id
        const PARTS_CSV_URL = `https://docs.google.com/spreadsheets/d/${PARTS_SHEET_ID}/export?format=csv`;
        
        try {
          const response = await fetch(PARTS_CSV_URL);
          if (!response.ok) {
            return JSON.stringify({ error: "Failed to fetch parts data", status: response.status });
          }
          
          const csvText = await response.text();
          const lines = csvText.split('\n');
          
          if (lines.length < 2) {
            return JSON.stringify({ error: "Parts sheet is empty or invalid" });
          }
          
          // Parse CSV header - exact columns from AAS parts sheet:
          // key, manufacturer, mfg_part, description, image_path, qr_payload, match_status, image_id
          const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
          
          const keyCol = headers.indexOf('key');
          const mfrCol = headers.indexOf('manufacturer');
          const partNumCol = headers.indexOf('mfg_part');
          const descCol = headers.indexOf('description');
          const imageIdCol = headers.indexOf('image_id');
          
          // Parse data rows and search
          const results: any[] = [];
          
          for (let i = 1; i < lines.length && results.length < 50; i++) {
            const line = lines[i];
            if (!line.trim()) continue;
            
            // CSV parse - handle commas within quotes
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
            
            const key = keyCol >= 0 ? values[keyCol] || '' : '';
            const manufacturer = mfrCol >= 0 ? values[mfrCol] || '' : '';
            const partNum = partNumCol >= 0 ? values[partNumCol] || '' : '';
            const desc = descCol >= 0 ? values[descCol] || '' : '';
            const imageId = imageIdCol >= 0 ? values[imageIdCol] || '' : '';
            
            // Search in key, part number, description, and manufacturer
            const searchText = `${key} ${partNum} ${desc} ${manufacturer}`.toLowerCase();
            
            if (searchText.includes(query)) {
              // Filter by manufacturer if specified
              if (mfr && !manufacturer.toLowerCase().includes(mfr.toLowerCase())) {
                continue;
              }
              
              results.push({
                key: key,
                manufacturer: manufacturer,
                partNumber: partNum,
                description: desc,
                imageUrl: imageId ? `https://drive.google.com/thumbnail?id=${imageId}&sz=w400` : null
              });
            }
          }
          
          return JSON.stringify({
            query: query,
            manufacturerFilter: mfr || null,
            count: results.length,
            parts: results
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
        
        // Fetch all tasks from Limble (handle pagination)
        let allTasks: any[] = [];
        let page = 1;
        let hasMore = true;
        
        while (hasMore && page <= 20) { // Max 20 pages to prevent infinite loops
          const url = `${LIMBLE_BASE_URL}/tasks?page=${page}&limit=100`;
          const response = await fetch(url, { headers: { Authorization: getLimbleAuth() } });
          if (!response.ok) {
            if (page === 1) return JSON.stringify({ error: "Failed to fetch work orders", status: response.status });
            break; // Got some data, stop here
          }
          
          const data = await response.json();
          const tasks = Array.isArray(data) ? data : (data.data || data.tasks || []);
          
          if (tasks.length === 0) {
            hasMore = false;
          } else {
            allTasks = allTasks.concat(tasks);
            page++;
            // If we got less than limit, we're done
            if (tasks.length < 100) hasMore = false;
          }
        }
        
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
        
        // Limble uses Unix timestamps (seconds) and dateCompleted > 0 means completed
        const now = Math.floor(Date.now() / 1000);
        const oneYearAgoUnix = now - (365 * 24 * 60 * 60);
        
        // Calculate stats before filtering
        const totalTasks = tasks.length;
        const completedThisYear = tasks.filter((t: any) => 
          t.dateCompleted && t.dateCompleted > 0 && t.dateCompleted >= oneYearAgoUnix
        ).length;
        const openTasks = tasks.filter((t: any) => !t.dateCompleted || t.dateCompleted === 0).length;
        
        // Get today's range for "completed today" stat
        const todayRange = getDateRangeUnix('today');
        const completedToday = todayRange ? tasks.filter((t: any) => 
          t.dateCompleted && t.dateCompleted >= todayRange.start && t.dateCompleted <= todayRange.end
        ).length : 0;
        
        if (status === "open") {
          // Open = not completed (dateCompleted is 0 or missing)
          tasks = tasks.filter((t: any) => !t.dateCompleted || t.dateCompleted === 0);
        } else if (status === "completed") {
          // First filter to only completed tasks
          tasks = tasks.filter((t: any) => t.dateCompleted && t.dateCompleted > 0);
          
          // Then apply date filter if provided
          if (dateFilter) {
            const range = getDateRangeUnix(dateFilter);
            if (range) {
              tasks = tasks.filter((t: any) => 
                t.dateCompleted >= range.start && t.dateCompleted <= range.end
              );
            }
          } else {
            // Default: last 7 days
            const sevenDaysAgoUnix = now - (7 * 24 * 60 * 60);
            tasks = tasks.filter((t: any) => t.dateCompleted >= sevenDaysAgoUnix);
          }
        }
        // status === "all" means no status filtering, but still apply date filter if present
        else if (status === "all" && dateFilter) {
          const range = getDateRangeUnix(dateFilter);
          if (range) {
            tasks = tasks.filter((t: any) => {
              const completed = t.dateCompleted && t.dateCompleted > 0;
              if (completed) {
                return t.dateCompleted >= range.start && t.dateCompleted <= range.end;
              }
              // For open tasks, check creation date if available
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
        
        // Return summary with key fields
        const summary = tasks.slice(0, 50).map((t: any) => ({
          taskID: t.taskID,
          name: t.name,
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
          
          for (let i = 1; i < lines.length && results.length < 30; i++) {
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
            
            if (!searchText.includes(query)) continue;
            
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
              tags
            });
          }
          
          return JSON.stringify({
            query,
            filters: { manufacturer: mfrFilter, doorType: doorTypeFilter, controller: controllerFilter },
            count: results.length,
            manuals: results
          });
          
        } catch (error) {
          return JSON.stringify({ 
            error: "Failed to search manuals", 
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

## CRITICAL INSTRUCTIONS
1. You HAVE ACCESS to work orders, doors, parts, technicians, manuals, and playbooks through your tools - USE THEM.
2. NEVER say "I don't have access" or "I can't see" - you CAN access data via tools.
3. When asked about tasks/work orders, USE get_work_orders immediately.
4. When asked about a door, USE get_door_info or search_doors.
5. For technical questions, USE search_playbooks AND/OR search_manuals.
6. For parts questions, USE search_parts.
7. If tools return stats, REPORT THOSE NUMBERS - don't guess or estimate.
8. NEVER HALLUCINATE - if a tool returns no results, say so. Don't make up part numbers or specs.

## YOUR TOOLS
1. **search_playbooks** - Error codes, procedures, wiring, specs from technical playbooks
2. **search_manuals** - Search manuals database for PDFs by manufacturer, controller, door type, model
3. **search_parts** - Parts inventory with part numbers, descriptions, images
4. **get_work_orders** - Tasks from Limble (status: open/completed/all, date_filter: today/yesterday/this_week/YYYY-MM-DD)
5. **get_technicians** - List techs with userIDs
6. **get_service_history** - Service records for a door (needs asset_id)
7. **get_door_info** - Door details by ID
8. **search_doors** - Find doors by customer/location

## IMPORTANT TECHNICAL NOTES
- Stanley MC521 can be programmed for BOTH slide AND swing doors - don't assume one or the other
- Horton 4190 is primarily for swing/folding doors
- When unsure about a controller's capabilities, search manuals first

## EXAMPLE QUERIES
- "MC521 parts" → search_parts(query: "mc521") - returns actual parts from inventory
- "MC521 swing manual" → search_manuals(query: "mc521 swing")
- "Ruben's tasks today" → get_technicians(name: "ruben"), then get_work_orders(status: "completed", date_filter: "today", user_id: ID)
- "ADC 60 controller" → search_parts(query: "adc 60")
- "Horton troubleshooting" → search_playbooks(query: "horton") + search_manuals(query: "horton")

## COMPANY
- Louisiana-based, 700+ customer locations
- Healthcare: Manning, Ochsner
- Door IDs: AAS-XXX, FD-XXX, Names like MH-1.81

## RESPONSE STYLE
- BE CONCISE - Techs are on mobile
- ANSWER DIRECTLY - No preamble
- NUMBERED STEPS for procedures
- Include part numbers and manual links when available
- If no results, say "No results found" - don't make up information`;

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
