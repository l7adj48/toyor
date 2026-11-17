import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';

const BOOT_ID = 'nf-boot';
const STATE_KEY = 'nutrifit_dz_state_v2';
const TOKEN_KEY = 'nf_auth_token';

function removeBootScreen(): void {
  const boot = document.getElementById(BOOT_ID);
  if (boot && boot.parentNode) {
    boot.parentNode.removeChild(boot);
  }
}

function clearLocalData(): void {
  try {
    localStorage.removeItem(STATE_KEY);
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage may be unavailable (private mode / blocked cookies). Reloading
    // still restores a working session from server or fresh defaults.
  }
}

/**
 * Last-resort surface. Shown only when React never mounted, so a failed bundle
 * load or a crashed root never leaves the visitor staring at a blank page.
 * Built with DOM APIs (no innerHTML) and no inline handlers, so it stays valid
 * under the production Content-Security-Policy.
 */
function showFatal(message: string): void {
  let boot = document.getElementById(BOOT_ID);
  if (!boot) {
    boot = document.createElement('div');
    boot.id = BOOT_ID;
    document.body.appendChild(boot);
  }
  boot.textContent = '';

  const box = document.createElement('div');
  box.className = 'nf-boot-box';

  const brand = document.createElement('div');
  brand.className = 'nf-boot-brand';
  brand.textContent = 'NUTRIFIT DZ';

  const title = document.createElement('h1');
  title.className = 'nf-boot-title';
  title.textContent = 'تعذّر تشغيل التطبيق';

  const detail = document.createElement('p');
  detail.className = 'nf-boot-detail';
  detail.textContent = message;

  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'nf-boot-btn';
  retry.textContent = 'إعادة التحميل';
  retry.addEventListener('click', () => window.location.reload());

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'nf-boot-btn nf-boot-btn-ghost';
  reset.textContent = 'تصفير البيانات المحلية وإعادة التحميل';
  reset.addEventListener('click', () => {
    clearLocalData();
    window.location.reload();
  });

  box.appendChild(brand);
  box.appendChild(title);
  box.appendChild(detail);
  box.appendChild(retry);
  box.appendChild(reset);
  boot.appendChild(box);
}

const container = document.getElementById('root');

if (!container) {
  showFatal('لم يُعثر على عنصر الجذر في الصفحة. افتح التطبيق من رابط الخدمة الأصلي ثم أعد التحميل.');
} else {
  try {
    createRoot(container).render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    );
    requestAnimationFrame(() => requestAnimationFrame(removeBootScreen));
  } catch (error) {
    showFatal(error instanceof Error ? error.message : 'خطأ غير متوقع أثناء بدء التشغيل.');
  }
}

window.addEventListener('error', (event) => {
  const root = document.getElementById('root');
  if (root && root.childElementCount === 0) {
    showFatal(event.message || 'تعذّر تحميل ملفات التطبيق. تحقق من الاتصال ثم أعد التحميل.');
  }
});
