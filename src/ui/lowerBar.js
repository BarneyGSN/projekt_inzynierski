import { LitElement, html, css } from 'lit';

export class LowerBar extends LitElement {
    static styles = css`
        :host {
            display: block;
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            z-index: 1000;
            box-sizing: border-box;
            pointer-events: auto; /
        }

        .panel {
            background: rgba(20, 20, 20, 0.85);
            backdrop-filter: blur(8px);
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            padding: 12px 24px;
            color: #ffffff;
            font-family: sans-serif;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
            box-sizing: border-box;
        }

        .row-container {
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
            gap: 20px;
        }

        .info-group {
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 24px;
        }

        h3, p {
            margin: 0;
        }

        h3 {
            font-size: 1.1rem;
            font-weight: 600;
        }

        p {
            font-size: 0.95rem;
            color: #ccc;
        }

        button {
            background: #1aff00;
            color: #000;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            font-weight: bold;
            cursor: pointer;
            transition: 0.2s;
            white-space: nowrap;
        }

        button:hover {
            background: #1aff00;
        }
    `;

    static properties = {
        title: { type: String },
        pointCount: { type: Number }
    };

    constructor() {
        super();
        this.title = 'Panel Kontrolny 3DGS';
        this.pointCount = 0;
    }

    _onResetCamera() {
        this.dispatchEvent(new CustomEvent('reset-camera', {
            bubbles: true,
            composed: true
        }));
    }

    render() {
        return html`
            <div class="panel">
                <div class="row-container">
                    <div class="info-group">
                        <h3>${this.title}</h3>
                        <p>Liczba splatów: <strong>${this.pointCount.toLocaleString()}</strong></p>
                    </div>
                    <button @click="${this._onResetCamera}">Resetuj położenie kamery</button>
                </div>
            </div>
        `;
    }
}

customElements.define('lower-bar', LowerBar);