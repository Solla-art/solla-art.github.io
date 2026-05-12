(async function () {
  const story = await loadStory();
  const memory = JSON.parse(localStorage.getItem("ghostNovelMemory") || "{}");
  const history = JSON.parse(localStorage.getItem("ghostNovelHistory") || "[]");
  const params = new URLSearchParams(location.search);
  const debugMode = params.get("debug") === "1";
  const requestedNode = params.get("node");
  let currentId = story.nodes[requestedNode] ? requestedNode : localStorage.getItem("ghostNovelNode") || story.start;

  if (story.nodes[requestedNode]) {
    history.length = 0;
  }

  const nodeText = document.getElementById("nodeText");
  const choices = document.getElementById("choices");
  const storyCard = document.getElementById("storyCard");
  const nodeId = document.getElementById("nodeId");
  const progressText = document.getElementById("progressText");
  const memoryForm = document.getElementById("memoryForm");
  const restartButton = document.getElementById("restartButton");
  const backButton = document.getElementById("backButton");
  const editorLink = document.getElementById("editorLink");

  restartButton.addEventListener("click", () => {
    localStorage.removeItem("ghostNovelMemory");
    localStorage.removeItem("ghostNovelNode");
    localStorage.removeItem("ghostNovelHistory");
    const restartParams = new URLSearchParams(location.search);
    restartParams.delete("node");
    const query = restartParams.toString();
    location.href = query ? `index.html?${query}` : "index.html";
  });

  if (backButton) {
    backButton.classList.toggle("hidden", !debugMode);
    backButton.addEventListener("click", () => {
      const previous = history.pop();
      if (!previous || !story.nodes[previous]) return;
      currentId = previous;
      save();
      render();
      scrollToNodeTop();
    });
  }

  async function loadStory() {
    if (window.PUBLIC_STORY_DATA) {
      return createPublicStory(window.PUBLIC_STORY_DATA);
    }

    const response = await fetch("story.txt", { cache: "no-store" });
    const source = await response.text();
    return StoryEngine.parseStory(source);
  }

  function createPublicStory(data) {
    const nodes = {};
    for (const id of data.order) {
      nodes[id] = { id, payload: data.nodes[id] };
    }
    return {
      meta: data.meta || {},
      style: data.style || {},
      variables: data.variables || {},
      nodes,
      order: data.order || [],
      start: data.start,
      publicKey: data.publicKey || "",
      encrypted: true
    };
  }

  function decodeBase64(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  function decryptPayload(value, key) {
    const bytes = decodeBase64(value);
    const keyBytes = new TextEncoder().encode(key);
    const decoded = new Uint8Array(bytes.length);
    for (let index = 0; index < bytes.length; index += 1) {
      decoded[index] = bytes[index] ^ keyBytes[index % keyBytes.length];
    }
    return new TextDecoder().decode(decoded);
  }

  function getNode(id) {
    const node = story.nodes[id];
    if (!node || !story.encrypted || node.lines) return node;
    const decrypted = JSON.parse(decryptPayload(node.payload, `${id}${story.publicKey}`));
    Object.assign(node, decrypted);
    return node;
  }

  function save() {
    localStorage.setItem("ghostNovelMemory", JSON.stringify(memory));
    localStorage.setItem("ghostNovelNode", currentId);
    localStorage.setItem("ghostNovelHistory", JSON.stringify(history));
    if (editorLink) {
      editorLink.href = `editor.html?node=${encodeURIComponent(currentId)}`;
    }
  }

  function sanitize(value, config = {}) {
    const maxLength = Number(config.maxLength || 48);
    return String(value || "")
      .replace(/[<>]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength);
  }

  function renderInput(node) {
    memoryForm.innerHTML = "";
    memoryForm.onsubmit = null;
    memoryForm.oninput = null;
    memoryForm.classList.toggle("hidden", node.inputs.length === 0);
    if (!node.inputs.length) return true;
    if (node.inputs.every((variableName) => memory[variableName])) {
      memoryForm.classList.add("hidden");
      return true;
    }

    let ready = true;
    for (const variableName of node.inputs) {
      const config = story.variables[variableName] || {};
      const field = document.createElement("label");
      field.className = "memory-field";
      field.innerHTML = `<div>${StoryEngine.renderLines([config.label || variableName], memory)}</div>`;

      const input = document.createElement("input");
      input.name = variableName;
      input.placeholder = config.placeholder || "";
      input.maxLength = Number(config.maxLength || 48);
      input.value = memory[variableName] || "";
      input.autocomplete = "name";

      field.append(input);
      memoryForm.append(field);

      if (!memory[variableName] && !input.value) ready = false;
    }

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "choice-button input-submit";
    submit.textContent = "Continue";
    submit.disabled = !ready && node.inputs.some((variableName) => !memoryForm.elements[variableName]?.value.trim());
    memoryForm.append(submit);

    memoryForm.onsubmit = (event) => {
      event.preventDefault();
      for (const variableName of node.inputs) {
        const config = story.variables[variableName] || {};
        const value = sanitize(memoryForm.elements[variableName]?.value, config);
        if (value) memory[variableName] = value;
      }
      save();
      render();
      scrollToNodeTop();
    };

    memoryForm.oninput = () => {
      const canSubmit = node.inputs.every((variableName) => memoryForm.elements[variableName]?.value.trim());
      submit.disabled = !canSubmit;
    };

    memoryForm.classList.toggle("hidden", ready);
    return ready;
  }

  function go(target) {
    if (!story.nodes[target]) return;
    history.push(currentId);
    currentId = target;
    save();
    render();
    scrollToNodeTop();
  }

  function scrollToNodeTop() {
    requestAnimationFrame(() => {
      storyCard.scrollIntoView({ behavior: "auto", block: "start" });
    });
  }

  function render() {
    const node = getNode(currentId) || getNode(story.start);
    currentId = node.id;

    const inputReady = renderInput(node);
    storyCard.classList.toggle("input-only", !inputReady && node.inputs.length > 0);
    nodeText.classList.remove("entering");
    void nodeText.offsetWidth;
    nodeText.classList.add("entering");
    nodeText.innerHTML = inputReady ? StoryEngine.renderLines(node.lines, memory) : "";

    choices.innerHTML = "";

    if (!inputReady) {
      if (nodeId) nodeId.textContent = `Node: ${node.id}`;
      if (progressText) progressText.textContent = `${story.order.indexOf(node.id) + 1} / ${story.order.length}`;
      if (backButton) backButton.disabled = history.length === 0;
      save();
      return;
    }

    for (const choice of node.choices) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice-button";
      button.innerHTML = StoryEngine.renderLines([choice.label], memory);
      button.disabled = !inputReady || !story.nodes[choice.target];
      button.addEventListener("click", () => go(choice.target));
      choices.append(button);
    }

    if (nodeId) nodeId.textContent = `Node: ${node.id}`;
    if (progressText) progressText.textContent = `${story.order.indexOf(node.id) + 1} / ${story.order.length}`;
    if (backButton) backButton.disabled = history.length === 0;
    save();
  }

  render();
})();
