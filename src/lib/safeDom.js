"use strict";

var twpSafeDom = (function () {
  function removeChildren(parent) {
    while (parent.firstChild) {
      parent.removeChild(parent.firstChild);
    }
  }

  function appendTrustedHTML(parent, html) {
    const targetDocument = parent.ownerDocument || document;
    const parsedDocument = new DOMParser().parseFromString(html, "text/html");
    const fragment = targetDocument.createDocumentFragment();

    for (const node of parsedDocument.head.childNodes) {
      fragment.appendChild(targetDocument.importNode(node, true));
    }
    for (const node of parsedDocument.body.childNodes) {
      fragment.appendChild(targetDocument.importNode(node, true));
    }

    parent.appendChild(fragment);
  }

  function setTrustedHTML(parent, html) {
    removeChildren(parent);
    appendTrustedHTML(parent, html);
  }

  function appendTextWithPlaceholders(parent, text, replacements) {
    let index = 0;
    const tokens = Object.keys(replacements);

    removeChildren(parent);

    while (index < text.length) {
      let nextToken = null;
      let nextIndex = -1;

      for (const token of tokens) {
        const tokenIndex = text.indexOf(token, index);
        if (tokenIndex !== -1 && (nextIndex === -1 || tokenIndex < nextIndex)) {
          nextToken = token;
          nextIndex = tokenIndex;
        }
      }

      if (nextIndex === -1) {
        parent.appendChild(document.createTextNode(text.slice(index)));
        break;
      }

      if (nextIndex > index) {
        parent.appendChild(document.createTextNode(text.slice(index, nextIndex)));
      }

      parent.appendChild(replacements[nextToken]());
      index = nextIndex + nextToken.length;
    }
  }

  function createTextElement(tagName, text) {
    const element = document.createElement(tagName);
    element.textContent = text;
    return element;
  }

  return {
    appendTrustedHTML,
    appendTextWithPlaceholders,
    createTextElement,
    removeChildren,
    setTrustedHTML,
  };
})();
