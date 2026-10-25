import {defineConfig} from "@playwright/test";
import base from "./playwright.config";
process.env.VITE_I18N_PREVIEW_LOCALES="true";
const port=5663,baseURL=`http://127.0.0.1:${port}`;
export default defineConfig({...base,workers:1,retries:0,outputDir:"test-results/about-polish",use:{...base.use,baseURL},projects:[{name:"chromium",use:{browserName:"chromium"}},{name:"webkit",use:{browserName:"webkit"}}],webServer:{command:`VITE_I18N_PREVIEW_LOCALES=true VITE_API_URL=${baseURL} pnpm --filter @retrodesk/web dev --host 127.0.0.1 --port ${port} --strictPort`,url:baseURL,reuseExistingServer:false,timeout:120000}});
