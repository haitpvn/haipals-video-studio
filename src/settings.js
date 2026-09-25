// "Cài đặt chung" panel: project-wide options.

export function initSettings({ root, project, onChange }) {
  root.innerHTML = `
    <h2><span class="step">3</span> Cài đặt chung</h2>
    <fieldset>
      <legend>🏷️ Thương hiệu</legend>
      <label class="check"><input type="checkbox" id="setBrandTag" /> Hiện nhãn “Haipals Đi Đâu” góc trên</label>
    </fieldset>`;
  const q = (id) => root.querySelector(`#${id}`);
  q('setBrandTag').addEventListener('change', () => {
    project.settings.brandTag = q('setBrandTag').checked;
    onChange();
  });
  const refresh = () => {
    q('setBrandTag').checked = project.settings.brandTag !== false;
  };
  refresh();
  return { refresh };
}
