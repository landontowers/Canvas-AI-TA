// ==UserScript==
// @name         Canvas Native LTI 1.3 Virtual TA Drawer (Resizable, Flat)
// @namespace    https://sdi.edu
// @version      2.3
// @description  Resizable native Canvas sidebar drawer with flat border (no left shadow) and bottom-right trigger
// @match        https://classroom.sdi.edu/*
// @match        https://*.instructure.com/*
// @grant        none
// ==/UserScript==
/* global window, document, localStorage, setTimeout */

(function() {
    'use strict';

    const DEFAULT_VIRTUAL_TA_URL = 'https://YOUR_VIRTUAL_TA_HOST_URL/?embedded=true';
    const VIRTUAL_TA_HTTPS_URL = localStorage.getItem('sdi_virtual_ta_url') || DEFAULT_VIRTUAL_TA_URL;
    let drawerWidth = parseInt(localStorage.getItem('sdi_virtual_ta_drawer_width') || '360', 10);
    if (isNaN(drawerWidth) || drawerWidth < 300) drawerWidth = 360;

    let isOpen = false;
    let isResizing = false;

    // 1. Create the Drawer Container (Flat style: border-left only, no drop-shadow)
    const drawer = document.createElement('div');
    drawer.id = 'sdi-virtual-ta-drawer-native';
    drawer.style.cssText = `
        position: fixed;
        top: 0;
        right: -${drawerWidth + 24}px;
        width: ${drawerWidth}px;
        height: 100vh;
        background: #ffffff;
        box-shadow: none;
        z-index: 999999;
        transition: right 0.25s cubic-bezier(0.25, 0.8, 0.25, 1);
        display: flex;
        flex-direction: column;
        border-left: 1px solid #CACFD5;
    `;

    // 2. Create the Left Edge Resize Handle
    const resizeHandle = document.createElement('div');
    resizeHandle.id = 'sdi-drawer-resizer';
    resizeHandle.title = 'Drag to resize Virtual TA width';
    resizeHandle.style.cssText = `
        position: absolute;
        top: 0;
        left: -4px;
        width: 8px;
        height: 100%;
        cursor: ew-resize;
        z-index: 1000000;
        user-select: none;
        transition: background 0.15s ease;
    `;

    // Subtle visual drag indicator
    const handleLine = document.createElement('div');
    handleLine.style.cssText = `
        position: absolute;
        top: 50%;
        left: 2px;
        transform: translateY(-50%);
        width: 4px;
        height: 48px;
        border-radius: 4px;
        background: #CACFD5;
        transition: background 0.2s ease, height 0.2s ease;
    `;
    resizeHandle.appendChild(handleLine);

    resizeHandle.addEventListener('mouseenter', () => {
        handleLine.style.background = '#D50032';
        handleLine.style.height = '64px';
    });
    resizeHandle.addEventListener('mouseleave', () => {
        if (!isResizing) {
            handleLine.style.background = '#CACFD5';
            handleLine.style.height = '48px';
        }
    });

    drawer.appendChild(resizeHandle);

    // 3. Create the iframe
    const iframe = document.createElement('iframe');
    iframe.src = VIRTUAL_TA_HTTPS_URL;
    iframe.style.cssText = 'width: 100%; height: 100%; border: none; flex: 1;';
    drawer.appendChild(iframe);
    document.body.appendChild(drawer);

    // 4. Create the Bottom-Right Floating Action Button
    let virtualTaOrigin = 'http://localhost:5173';
    try {
        virtualTaOrigin = new URL(VIRTUAL_TA_HTTPS_URL).origin;
    } catch {
        // Fall back cleanly if stored URL is relative or unparseable
    }
    const TA_ICON = `<img src="${virtualTaOrigin}/assets/virtual-ta-logo-transparent-64.png" width="20" height="20" alt="" aria-hidden="true" style="display:block;flex-shrink:0;background:transparent;" />`;
    const CLOSE_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

    const btn = document.createElement('button');
    btn.id = 'virtual-ta-fab';
    btn.type = 'button';
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = `${TA_ICON}<span>Virtual TA</span>`;
    btn.title = 'Toggle SDI Virtual TA';
    btn.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 1000001;
        background: #1D272F;
        color: #ffffff;
        border: 1px solid rgba(255,255,255,0.16);
        border-radius: 24px;
        padding: 10px 18px;
        font-size: 14px;
        font-weight: 700;
        font-family: Lato, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        cursor: pointer;
        box-shadow: 0 4px 14px rgba(0,0,0,0.25);
        transition: right 0.25s cubic-bezier(0.25, 0.8, 0.25, 1), background 0.2s ease, transform 0.15s ease;
        display: flex;
        align-items: center;
        gap: 8px;
    `;

    btn.addEventListener('mouseenter', () => {
        btn.style.transform = 'translateY(-2px)';
    });
    btn.addEventListener('mouseleave', () => {
        btn.style.transform = 'translateY(0)';
    });

    document.body.appendChild(btn);

    // 5. Layout update & toggle logic
    function updateLayout(animate = true) {
        if (!animate) {
            drawer.style.transition = 'none';
        } else {
            drawer.style.transition = 'right 0.25s cubic-bezier(0.25, 0.8, 0.25, 1)';
        }

        drawer.style.width = `${drawerWidth}px`;
        drawer.style.right = isOpen ? '0px' : `-${drawerWidth + 24}px`;

        const canvasMain = document.getElementById('wrapper') || document.getElementById('main') || document.body;
        if (canvasMain) {
            canvasMain.style.transition = animate ? 'margin-right 0.25s cubic-bezier(0.25, 0.8, 0.25, 1)' : 'none';
            canvasMain.style.marginRight = isOpen ? `${drawerWidth}px` : '0px';
        }

        // Move button adjacent to drawer when open, or back to bottom-right when closed
        btn.style.right = isOpen ? `${drawerWidth + 18}px` : '24px';
        btn.style.background = isOpen ? '#101820' : '#1D272F';
        btn.innerHTML = isOpen ? `${CLOSE_ICON}<span>Close Virtual TA</span>` : `${TA_ICON}<span>Virtual TA</span>`;
        btn.setAttribute('aria-expanded', String(isOpen));

        if (!animate) {
            setTimeout(() => {
                drawer.style.transition = 'right 0.25s cubic-bezier(0.25, 0.8, 0.25, 1)';
            }, 50);
        }
    }

    function toggleDrawer() {
        isOpen = !isOpen;
        updateLayout(true);
        if (isOpen) {
            sendLtiContext();
        }
    }

    btn.addEventListener('click', toggleDrawer);

    // 6. Resizing Drag Handler
    resizeHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isResizing = true;
        iframe.style.pointerEvents = 'none'; // Prevents iframe from trapping mouse events while dragging
        document.body.style.userSelect = 'none';
        drawer.style.transition = 'none';

        const canvasMain = document.getElementById('wrapper') || document.getElementById('main') || document.body;
        if (canvasMain) {
            canvasMain.style.transition = 'none';
        }
        btn.style.transition = 'none';

        function onMouseMove(moveEvent) {
            if (!isResizing) return;
            const newWidth = Math.max(300, Math.min(window.innerWidth - 120, window.innerWidth - moveEvent.clientX));
            drawerWidth = newWidth;
            drawer.style.width = `${drawerWidth}px`;
            if (canvasMain) {
                canvasMain.style.marginRight = `${drawerWidth}px`;
            }
            btn.style.right = `${drawerWidth + 18}px`;
        }

        function onMouseUp() {
            if (!isResizing) return;
            isResizing = false;
            iframe.style.pointerEvents = 'auto';
            document.body.style.userSelect = '';
            handleLine.style.background = '#CACFD5';
            handleLine.style.height = '48px';

            localStorage.setItem('sdi_virtual_ta_drawer_width', String(drawerWidth));

            drawer.style.transition = 'right 0.25s cubic-bezier(0.25, 0.8, 0.25, 1)';
            if (canvasMain) {
                canvasMain.style.transition = 'margin-right 0.25s cubic-bezier(0.25, 0.8, 0.25, 1)';
            }
            btn.style.transition = 'right 0.25s cubic-bezier(0.25, 0.8, 0.25, 1), background 0.2s ease, transform 0.15s ease';

            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        }

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    });

    // 7. LTI Context & Escape Key Handler
    function sendLtiContext() {
        const courseMatch = window.location.pathname.match(/\/courses\/(\d+|[a-zA-Z0-9_-]+)/);
        const courseId = courseMatch ? courseMatch[1] : (window.ENV?.COURSE_ID || 'sdi-ftt101');
        const pageTitle = document.title.replace(/\s*:\s*.*$/, '').trim() || 'Course Page';

        let targetOrigin = '*';
        try {
            targetOrigin = new URL(VIRTUAL_TA_HTTPS_URL).origin;
        } catch {
            // Fall back cleanly if stored URL is relative or unparseable
        }

        iframe.contentWindow?.postMessage({
            subject: 'lti.pageContent',
            course_id: courseId,
            page_title: pageTitle,
            url: window.location.href,
        }, targetOrigin);
    }

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen) {
            toggleDrawer();
        }
    });

    window.addEventListener('message', (event) => {
        if (event.data?.subject === 'lti.getPageContent') {
            sendLtiContext();
        }
    });

    // Initialize in closed state cleanly
    updateLayout(false);
})();
