import { LitElement, html, css } from 'lit';

export class FileList extends LitElement {
    static styles = css`
        :host {
            display: block;
            position: absolute;
            top: 100px;
            left: 16px;
            z-index: 99999;
            pointer-events: auto;
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
        }
        .panel {
            background: rgba(20, 20, 20, 0.85);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 8px;
            padding: 12px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
            min-width: 220px;
            color: #d1d5db;
        }
        .header {
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            color: #9ca3af;
            margin-bottom: 8px;
            padding-bottom: 6px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        ul {
            list-style: none;
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 6px;
            max-height: 240px;
            overflow-y: auto;
        }
        li {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.05);
            padding: 6px 10px;
            border-radius: 6px;
            font-size: 12px;
        }
        .file-name {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 170px;
            color: #f3f4f6;
        }
        .empty-label {
            font-size: 12px;
            color: #6b7280;
            text-align: center;
            padding: 8px 0;
        }
        .btn-remove {
            background: transparent;
            border: none;
            color: #ef4444;
            cursor: pointer;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 12px;
            opacity: 0.7;
            transition: opacity 0.15s ease, background 0.15s ease;
        }
        .btn-remove:hover {
            opacity: 1;
            background: rgba(239, 68, 68, 0.15);
        }
    `;

    static properties = {
        files: { type: Array }
    };

    constructor() {
        super();
        this.files = [];
    }

    removeFile(id) {
        this.dispatchEvent(new CustomEvent('file-removed', {
            detail: { id },
            bubbles: true,
            composed: true
        }));
        this.files = this.files.filter(file => file.id !== id);
    }

    render() {
        return html`
            <div class="panel">
                <div class="header">Wczytane warstwy (${this.files.length})</div>
                ${this.files.length === 0
                        ? html`<div class="empty-label">Brak aktywnych plików</div>`
                        : html`
                        <ul>
                            ${this.files.map(file => html`
                                <li>
                                    <span class="file-name" title="${file.name}">${file.name}</span>
                                    <button class="btn-remove" @click="${() => this.removeFile(file.id)}">✕</button>
                                </li>
                            `)}
                        </ul>
                    `
                }
            </div>
        `;
    }
}

customElements.define('file-list', FileList);