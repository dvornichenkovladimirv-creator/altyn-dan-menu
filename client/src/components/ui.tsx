import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button
      {...rest}
      className={`bg-brand-600 hover:bg-brand-700 text-white rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 ${className}`}
    />
  );
}

export function SecondaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button
      {...rest}
      className={`bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 ${className}`}
    />
  );
}

export function DangerButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button
      {...rest}
      className={`text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-50 ${className}`}
    />
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return (
    <input
      {...rest}
      className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 ${className}`}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", ...rest } = props;
  return (
    <select
      {...rest}
      className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 ${className}`}
    />
  );
}

export function Label({ children }: { children: string }) {
  return <label className="block text-sm font-medium mb-1 text-gray-700">{children}</label>;
}

export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <h1 className="text-2xl font-bold text-gray-800">{title}</h1>
      {action}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`bg-white rounded-lg shadow-sm border ${className}`}>{children}</div>;
}
