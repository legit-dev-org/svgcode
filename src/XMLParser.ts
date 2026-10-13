export class XMLNode {
    public name: string;
    public rawAttributes: Record<string, string>;
    public attributes: Record<string, string>;
    public children: XMLNode[];
    public textContent?: string;

    constructor(name: string, attributes: Record<string, string>, children: XMLNode[]) {
        this.name = name;
        this.rawAttributes = attributes;
        this.attributes = this.deNamespaceAttributes(attributes);
        this.children = children;
    }

    public walkChildrenRecursive(callback: (node: XMLNode) => boolean | void): void {
        const nodesToWalk = [...this.children];
        while (nodesToWalk.length > 0) {
            const node = nodesToWalk.shift();

            let res: boolean | void = false;
            if (node !== undefined) {
                res = callback(node);
            }
            if (res === false) {
                return;
            }
            nodesToWalk.push(...(node?.children ?? []));
        }
    }

    public deNamespaceAttributes(attributes: Record<string, string>): Record<string, string> {
        const attr: Record<string, string> = {};
        for (const key of Object.keys(attributes)) {
            if (key.indexOf(":") !== -1) {
                attr[key.substring(key.indexOf(":") + 1)] = attributes[key];
            } else {
                attr[key] = attributes[key];
            }
        }
        return attr;
    }
}

export function parseXML(xmlString: string): XMLNode[] {
    const nodes: XMLNode[] = [];
    const stack: XMLNode[] = [];

    // Clean up whitespace between tags, but preserve content inside tags
    const sanitized = xmlString.replace(/>\s+</g, '><').trim();

    // Regex to match tags: <(?<isClosing>\/)?(?<tagName>[a-zA-Z0-9:-]+)(?<attributes>[^>]*?)(?<isSelfClosing>\/)? >
    const tagRegex = /<(\/)?([a-zA-Z0-9:-]+)([^>]*?)(\/)?>/g;

    // Regex to extract key="value" or key='value' pairs from attribute strings
    const attrRegex = /([a-zA-Z0-9:-]+)=(?:"([^"]*)"|'([^']*)')/g;

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = tagRegex.exec(sanitized)) !== null) {
        const [fullTag, isClosing, tagName, attrString, isSelfClosing] = match;
        const matchIndex = match.index;

        // 1. Capture text content between the last tag and this current tag
        if (matchIndex > lastIndex) {
            const textContent = sanitized.substring(lastIndex, matchIndex).trim();
            if (textContent && stack.length > 0) {
                stack[stack.length - 1].textContent = textContent;
            }
        }

        lastIndex = tagRegex.lastIndex;

        // 2. Handle Closing Tag
        if (isClosing) {
            const popped = stack.pop();
            if (!popped || popped.name !== tagName) {
                throw new Error(`Mismatched closing tag: expected string closing for <${popped?.name}> but found </${tagName}>`);
            }
            if (stack.length === 0) {
                nodes.push(popped);
            }
            continue;
        }

        // 3. Parse Attributes
        const attributes: Record<string, string> = {};
        let attrMatch: RegExpExecArray | null;
        while ((attrMatch = attrRegex.exec(attrString)) !== null) {
            const [, key, doubleQuoteVal, singleQuoteVal] = attrMatch;
            attributes[key] = doubleQuoteVal ?? singleQuoteVal ?? "";
        }

        // 4. Create New Node
        const newNode = new XMLNode(tagName, attributes, []);

        // 5. Handle Node Hierarchy
        if (stack.length > 0) {
            stack[stack.length - 1].children.push(newNode);
        }

        // Push to stack if it expects children, otherwise treat it as a root if stack is empty
        if (!isSelfClosing) {
            stack.push(newNode);
        } else if (stack.length === 0) {
            nodes.push(newNode);
        }
    }

    if (stack.length > 0) {
        throw new Error(`Unclosed tag: <${stack[stack.length - 1].name}>`);
    }

    return nodes;
}
