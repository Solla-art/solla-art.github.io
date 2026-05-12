(function () {
  const choicePattern = /^\s*(?:\[\[\s*(.*?)\s*(?:->|→|==)\s*([^\]]+?)\s*\]\]|\[\s*(.*?)\s*(?:->|→|==)\s*([^\]]+?)\s*\])\s*$/;

  function cleanTarget(target) {
    return String(target || "").trim().replace(/^==\s*/, "");
  }

  function parseJsonDirective(line, prefix, fallback) {
    if (!line.startsWith(prefix)) return null;
    const raw = line.slice(prefix.length).trim();
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function parseStory(source) {
    const lines = source.replace(/\r\n/g, "\n").split("\n");
    const meta = { title: "Untitled Story" };
    const style = {};
    const variables = {};
    const nodes = {};
    const order = [];
    let start = "intro";
    let current = null;
    let inCodeBlock = false;

    function ensureNode(id) {
      if (!nodes[id]) {
        nodes[id] = { id, lines: [], choices: [], inputs: [], rawLines: [] };
        order.push(id);
      }
      return nodes[id];
    }

    for (const line of lines) {
      if (line.startsWith("#")) continue;

      const storyDirective = parseJsonDirective(line, "::story", null);
      if (storyDirective) {
        Object.assign(meta, storyDirective);
        continue;
      }

      const styleDirective = parseJsonDirective(line, "::style", null);
      if (styleDirective) {
        Object.assign(style, styleDirective);
        continue;
      }

      if (line.startsWith("::start")) {
        start = line.slice("::start".length).trim() || start;
        continue;
      }

      if (line.startsWith("::var")) {
        const match = line.match(/^::var\s+([A-Za-z_][\w-]*)\s*(.*)$/);
        if (match) {
          variables[match[1]] = match[2] ? JSON.parse(match[2]) : {};
        }
        continue;
      }

      const nodeMatch = line.match(/^==\s*([A-Za-z0-9_-]+)/);
      if (nodeMatch) {
        current = ensureNode(nodeMatch[1]);
        inCodeBlock = false;
        continue;
      }

      if (!current) continue;

      current.rawLines.push(line);

      if (line.trim() === "```") {
        current.lines.push(line);
        inCodeBlock = !inCodeBlock;
        continue;
      }

      if (inCodeBlock) {
        current.lines.push(line);
        continue;
      }

      const inputMatch = line.match(/^@input\s+([A-Za-z_][\w-]*)/);
      if (inputMatch) {
        current.inputs.push(inputMatch[1]);
        continue;
      }

      const choiceMatch = line.match(choicePattern);
      if (choiceMatch) {
        current.choices.push({
          label: (choiceMatch[1] || choiceMatch[3] || "").trim(),
          target: cleanTarget(choiceMatch[2] || choiceMatch[4])
        });
        continue;
      }

      current.lines.push(line);
    }

    return { meta, style, variables, nodes, order, start };
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function applyInlineMarkup(text, memory) {
    let html = escapeHtml(text).replace(/\{\{([A-Za-z_][\w-]*)\}\}/g, (_, key) => {
      return escapeHtml(memory[key] || "");
    });

    html = html
      .replace(/\[center\]([\s\S]*?)\[\/center\]/g, '<span class="align-center">$1</span>')
      .replace(/\[right\]([\s\S]*?)\[\/right\]/g, '<span class="align-right">$1</span>')
      .replace(/\[red\]([\s\S]*?)\[\/red\]/g, '<span class="tone-red">$1</span>')
      .replace(/\[small\]([\s\S]*?)\[\/small\]/g, '<span class="tone-small">$1</span>')
      .replace(/\[big\]([\s\S]*?)\[\/big\]/g, '<span class="tone-big">$1</span>')
      .replace(/~~([\s\S]+?)~~/g, "<s>$1</s>")
      .replace(/\*\*\*([\s\S]+?)\*\*\*/g, "<strong><em>$1</em></strong>")
      .replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([\s\S]+?)\*/g, "<em>$1</em>");

    return html;
  }

  function renderLines(lines, memory = {}) {
    const blocks = [];
    let codeLines = null;

    for (const line of lines) {
      if (line.trim() === "```") {
        if (codeLines) {
          blocks.push(`<pre class="preserve-block"><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
          codeLines = null;
        } else {
          codeLines = [];
        }
        continue;
      }

      if (codeLines) {
        codeLines.push(line);
        continue;
      }

      if (line.trim()) {
        blocks.push(`<p>${applyInlineMarkup(line, memory)}</p>`);
      }
    }

    if (codeLines) {
      blocks.push(`<pre class="preserve-block"><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
    }

    return blocks.join("");
  }

  function serializeStory(parsed) {
    const lines = [];
    lines.push(`::story ${JSON.stringify(parsed.meta)}`);
    lines.push(`::start ${parsed.start}`);
    for (const [name, config] of Object.entries(parsed.variables)) {
      lines.push(`::var ${name} ${JSON.stringify(config)}`);
    }
    lines.push(`::style ${JSON.stringify(parsed.style)}`);
    lines.push("");

    for (const id of parsed.order) {
      const node = parsed.nodes[id];
      lines.push(`==${id}`);
      lines.push(...node.rawLines);
      lines.push("");
    }

    return lines.join("\n");
  }

  window.StoryEngine = {
    parseStory,
    renderLines,
    serializeStory,
    choicePattern,
    cleanTarget
  };
})();
