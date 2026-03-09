const STORE_STYLES = `
#hltb-store-data {
  background: rgba(0, 0, 0, 0.2);
  padding: 12px 16px;
  margin-bottom: 12px;
  border-radius: 2px;
}

#hltb-store-data .hltb-store-title {
  color: #556772;
  font-size: 10px;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin: 0 0 8px 0;
}

#hltb-store-data .hltb-store-rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

#hltb-store-data .hltb-store-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #8f98a0;
  font-size: 12px;
  line-height: 20px;
}

#hltb-store-data .hltb-store-row span {
  color: #acb2b8;
  font-weight: bold;
}

#hltb-store-data .hltb-store-link {
  display: block;
  margin-top: 8px;
  color: #67c1f5;
  font-size: 11px;
  text-decoration: none;
}

#hltb-store-data .hltb-store-link:hover {
  color: #ffffff;
}

#hltb-store-data .hltb-store-loading {
  color: #8f98a0;
  font-size: 12px;
}
`;

const STYLE_ID = 'hltb-store-styles';

export function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STORE_STYLES;
  document.head.appendChild(style);
}
