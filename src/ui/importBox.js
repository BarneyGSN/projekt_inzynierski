import { LitElement, html, css } from "lit";

export class ImportBox extends LitElement {
    static styles = css`
        :host {
            display: block;
            position: absolute;
            top: 16px;
            left: 16px;
            z-index: 1000;
            pointer-events: auto;
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
        }

        .panel {
            /* Główny grafit UI wyróżniający się z czerni (#000000) */
            background: rgba(30, 34, 42, 0.92);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 8px;
            padding: 6px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
            display: flex;
            gap: 6px;
            align-items: center;
        }

        .dropdown {
            position: relative;
            display: inline-block;
        }

        .dropbtn {
            background: transparent;
            border: 1px solid transparent;
            border-radius: 5px;
            padding: 7px 14px;
            color: #d1d5db; /* Czytelny jasnoszary */
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
        }

        /* Stan hover przycisku w stylu SuperSplat */
        .dropdown:hover .dropbtn,
        .dropbtn:hover {
            background: rgba(255, 255, 255, 0.08);
            color: #ffffff;
            border-color: rgba(255, 255, 255, 0.12);
        }

        .dropdown-content {
            display: none;
            position: absolute;
            top: calc(100% + 4px);
            left: 0;
            min-width: 150px;
            background: rgba(24, 27, 33, 0.98);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            padding: 4px;
            box-shadow: 0 12px 28px rgba(0, 0, 0, 0.6);
            z-index: 10;
        }

        .dropdown-content a {
            color: #9ca3af;
            padding: 8px 12px;
            text-decoration: none;
            display: block;
            font-size: 13px;
            border-radius: 4px;
            transition: background 0.15s ease, color 0.15s ease;
        }

        /* Podświetlenie aktywnej opcji menu */
        .dropdown-content a:hover {
            background: rgba(59, 130, 246, 0.2); /* Delikatny akcent błękitny */
            color: #60a5fa;
        }

        .dropdown:hover .dropdown-content {
            display: block;
        }
    `;

    static properties = {
        title: { type: String }
    };

    constructor() {
        super();
        this.title = "Plik";
    }

    render() {
        return html`
            <div class="panel">
                <div class="dropdown">
                    <button class="dropbtn">Plik</button>
                    <div class="dropdown-content">
                        <a href="#">Import</a>
                        <a href="#">Export</a>
                    </div>
                </div>
                <div class="dropdown">
                    <button class="dropbtn">Edycja</button>
                    <div class="dropdown-content">
                        <a href="#">Undo</a>
                        <a href="#">Redo</a>
                    </div>
                </div>
                <slot></slot>
            </div>
        `;
    }
}

customElements.define('import-box', ImportBox);