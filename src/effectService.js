
const EffectService = {
    triggerGodMode() {
        // Create style element for the animation
        const style = document.createElement('style');
        style.id = 'god-mode-style';

        // //version 1.0.0
        // style.innerHTML = `
        //     @keyframes godModeGlitch {
        //         0% { transform: translate(0) scale(1); filter: invert(0); }
        //         10% { transform: translate(-5px, 5px) skew(5deg); filter: invert(1); }
        //         20% { transform: translate(5px, -5px) skew(-5deg); filter: hue-rotate(90deg); }
        //         30% { transform: translate(-5px, 5px) scale(1.1); filter: invert(0); }
        //         40% { transform: translate(5px, -5px) skew(2deg); filter: contrast(200%); }
        //         50% { transform: translate(0) scale(1.05); filter: hue-rotate(180deg); }
        //         60% { transform: translate(-2px, 2px) skew(-2deg); filter: invert(1); }
        //         100% { transform: translate(0) scale(1); filter: invert(0); }
        //     }
        //     .god-mode-active {
        //         animation: godModeGlitch 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) both;
        //         pointer-events: none;
        //         overflow: hidden; /* Prevent scrollbars during shake */
        //     }
        // `;

        //version 3.0.0
        style.innerHTML = `
            @keyframes heavyBlurFocus {
                0% {
                    filter: blur(0);
                }

                20% {
                    filter: blur(3px);
                }

                40% {
                    filter: blur(10px);
                }

                55% {
                    filter: blur(18px);
                }

                75% {
                    filter: blur(6px);
                }

                100% {
                    filter: blur(0);
                }
            }

            .god-mode-active {
                animation: heavyBlurFocus 0.9s cubic-bezier(0.4, 0.0, 0.2, 1) both;
                position: relative;
                will-change: filter;
            }
        `;

        
        if (!document.getElementById('god-mode-style')) {
            document.head.appendChild(style);
        }

        document.body.classList.add('god-mode-active');
        
        setTimeout(() => {
            document.body.classList.remove('god-mode-active');
            style.remove();
        }, 800);
    },
    
    triggerScanLine() {
        if (document.getElementById('scan-line-style')) return;

        const style = document.createElement('style');
        style.id = 'scan-line-style';
        style.innerHTML = `
            @keyframes scanLine {
                0% { top: -10%; opacity: 0; }
                10% { opacity: 1; }
                90% { opacity: 1; }
                100% { top: 110%; opacity: 0; }
            }
            
            @keyframes scanFade {
                0% { background: rgba(142, 68, 173, 0); }
                50% { background: rgba(142, 68, 173, 0.05); }
                100% { background: rgba(142, 68, 173, 0); }
            }

            .scan-line-element {
                position: fixed;
                left: 0;
                width: 100%;
                height: 5px;
                background: linear-gradient(to bottom, transparent, #8e44ad, transparent);
                box-shadow: 0 0 15px rgba(142, 68, 173, 0.8), 0 0 30px rgba(142, 68, 173, 0.4);
                z-index: 10000;
                pointer-events: none;
                animation: scanLine 1.5s cubic-bezier(0.19, 1, 0.22, 1) forwards;
            }

            .scan-screen-flash {
                position: fixed;
                inset: 0;
                z-index: 9999;
                pointer-events: none;
                animation: scanFade 1.5s ease-in-out forwards;
            }
        `;
        document.head.appendChild(style);

        const line = document.createElement('div');
        line.className = 'scan-line-element';
        
        const flash = document.createElement('div');
        flash.className = 'scan-screen-flash';

        document.body.appendChild(line);
        document.body.appendChild(flash);

        setTimeout(() => {
            line.remove();
            flash.remove();
            style.remove();
        }, 1600);
    }
};

export { EffectService };
