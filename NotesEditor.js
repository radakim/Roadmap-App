// ============================================================
// NotesEditor.js - Unlimited-length journal editor.
// Keeps the text locally while typing and commits it to the app
// state after a short pause (and immediately on unmount/flush),
// so very long notes stay responsive and auto-save still works.
// ============================================================

import React, { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { TextInput, View, Text } from 'react-native';

const COMMIT_DELAY_MS = 400;

const NotesEditor = forwardRef(function NotesEditor(
  { value, onCommit, style, counterLabel, counterStyle, counterContainerStyle, ...inputProps },
  ref
) {
  const [text, setText] = useState(value || '');
  const committed = useRef(value || '');
  const pending = useRef(null);
  const timer = useRef(null);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const flush = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (pending.current !== null && pending.current !== committed.current) {
      committed.current = pending.current;
      onCommitRef.current && onCommitRef.current(pending.current);
    }
    pending.current = null;
  };

  useImperativeHandle(ref, () => ({ flush, getText: () => (pending.current !== null ? pending.current : text) }));

  // External changes (insert summary, undo clear, day switch) replace the local text
  useEffect(() => {
    const incoming = value || '';
    if (incoming !== committed.current && pending.current === null) {
      committed.current = incoming;
      setText(incoming);
    }
  }, [value]);

  // Never lose the last keystrokes when the editor closes
  useEffect(() => () => flush(), []);

  const handleChange = (next) => {
    setText(next);
    pending.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, COMMIT_DELAY_MS);
  };

  return (
    <View style={{ flex: 1 }}>
      {counterLabel ? (
        <View style={counterContainerStyle}>
          {/* Informational only: there is no maximum length */}
          <Text style={counterStyle} testID="notes-counter">{counterLabel(text.length)}</Text>
        </View>
      ) : null}
      <TextInput
        {...inputProps}
        style={style}
        multiline
        value={text}
        onChangeText={handleChange}
        onBlur={flush}
        textAlignVertical="top"
        scrollEnabled
      />
    </View>
  );
});

export default NotesEditor;
