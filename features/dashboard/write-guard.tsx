"use client";
// 읽기 전용(둘러보기)일 때 쓰기 동작의 입구를 막고, 대신 바깥에서 넘겨준 안내를 띄운다.
import { createContext, useContext } from "react";

type Guard = { readOnly: boolean; onBlocked: () => void };
const WriteGuardContext = createContext<Guard>({ readOnly: false, onBlocked: () => {} });

export const WriteGuardProvider = WriteGuardContext.Provider;

/** 쓰기 동작을 감싼다. 읽기 전용이면 동작 대신 안내를 띄운다. */
export function useWriteGuard() {
  const { readOnly, onBlocked } = useContext(WriteGuardContext);
  return <A extends unknown[]>(fn: (...args: A) => void) => (...args: A) => (readOnly ? onBlocked() : fn(...args));
}
