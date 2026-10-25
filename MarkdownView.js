// ============================================================
// MarkdownView.js - Renders lesson Markdown as native blocks.
// Each block is its own <Text>, so very long lessons render and
// scroll completely (a single giant Text node can be clipped on
// Android) and text stays selectable.
// ============================================================

import React, { useMemo } from 'react';
import { View, Text, ScrollView, Platform, StyleSheet } from 'react-native';
import { parseMarkdownBlocks, parseInline } from './markdown';

const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

function Inline({ text, style }) {
  const spans = parseInline(text);
  return (
    <Text style={style} selectable>
      {spans.map((s, i) => (
        <Text
          key={i}
          style={[
            s.bold && { fontWeight: '800', color: '#f8fafc' },
            s.italic && { fontStyle: 'italic' },
            s.code && md.inlineCode
          ]}
        >
          {s.text}
        </Text>
      ))}
    </Text>
  );
}

export default function MarkdownView({ content, accentColor = '#38bdf8' }) {
  const blocks = useMemo(() => parseMarkdownBlocks(content), [content]);

  return (
    <View>
      {blocks.map((b, idx) => {
        switch (b.type) {
          case 'heading': {
            const size = b.level === 1 ? 20 : b.level === 2 ? 17 : b.level === 3 ? 15 : 14;
            return (
              <Inline
                key={idx}
                text={b.text}
                style={[md.heading, { fontSize: size, color: b.level <= 2 ? '#f8fafc' : accentColor }]}
              />
            );
          }
          case 'code':
            return (
              <ScrollView key={idx} horizontal style={md.codeBox} contentContainerStyle={{ padding: 10 }}>
                <Text style={md.codeText} selectable>{b.text}</Text>
              </ScrollView>
            );
          case 'bullet':
            return (
              <View key={idx} style={[md.listRow, { paddingLeft: 4 + b.level * 14 }]}>
                <Text style={[md.bulletMark, { color: accentColor }]}>
                  {b.checked === undefined ? '•' : b.checked ? '☑' : '☐'}
                </Text>
                <Inline text={b.text} style={md.listText} />
              </View>
            );
          case 'numbered':
            return (
              <View key={idx} style={[md.listRow, { paddingLeft: 4 + b.level * 14 }]}>
                <Text style={[md.bulletMark, { color: accentColor, minWidth: 22 }]}>{b.marker}</Text>
                <Inline text={b.text} style={md.listText} />
              </View>
            );
          case 'table':
            return (
              <ScrollView key={idx} horizontal style={md.tableWrap}>
                <View>
                  {b.rows.map((row, rIdx) => (
                    <View key={rIdx} style={[md.tableRow, rIdx === 0 && md.tableHeadRow]}>
                      {row.map((cell, cIdx) => (
                        <View key={cIdx} style={md.tableCell}>
                          <Inline text={cell} style={[md.tableText, rIdx === 0 && { fontWeight: '800', color: '#f8fafc' }]} />
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
            );
          case 'quote':
            return (
              <View key={idx} style={[md.quote, { borderLeftColor: accentColor }]}>
                <Inline text={b.text} style={md.quoteText} />
              </View>
            );
          case 'hr':
            return <View key={idx} style={md.hr} />;
          default:
            return <Inline key={idx} text={b.text} style={md.paragraph} />;
        }
      })}
    </View>
  );
}

const md = StyleSheet.create({
  heading: { fontWeight: '800', marginTop: 14, marginBottom: 6, lineHeight: 24 },
  paragraph: { color: '#e2e8f0', fontSize: 14, lineHeight: 22, marginBottom: 8 },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  bulletMark: { fontSize: 14, lineHeight: 22, marginRight: 6, fontWeight: '800' },
  listText: { flex: 1, color: '#e2e8f0', fontSize: 14, lineHeight: 22 },
  inlineCode: { fontFamily: MONO, color: '#fbbf24', backgroundColor: '#1e293b', fontSize: 13 },
  codeBox: { backgroundColor: '#030712', borderColor: '#1e293b', borderWidth: 1, borderRadius: 8, marginVertical: 8 },
  codeText: { color: '#4ade80', fontFamily: MONO, fontSize: 12, lineHeight: 18 },
  tableWrap: { marginVertical: 8, borderColor: '#1e293b', borderWidth: 1, borderRadius: 8 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  tableHeadRow: { backgroundColor: '#172338' },
  tableCell: { width: 150, padding: 8, borderRightWidth: 1, borderRightColor: '#1e293b' },
  tableText: { color: '#cbd5e1', fontSize: 12, lineHeight: 17 },
  quote: { borderLeftWidth: 3, paddingLeft: 10, marginVertical: 6 },
  quoteText: { color: '#94a3b8', fontSize: 13, lineHeight: 20, fontStyle: 'italic' },
  hr: { height: 1, backgroundColor: '#1e293b', marginVertical: 12 }
});
