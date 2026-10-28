import { Children, Fragment, isValidElement, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "./select";

type OptionProps = { value?: string | number; disabled?: boolean; label?: string; children?: ReactNode };
type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value" | "onChange" | "defaultValue"> & {
  value?: string | number;
  defaultValue?: string | number;
  onValueChange?: (value: string) => void;
};

// Keep the existing option definitions while using the same bounded list everywhere.
function options(children: ReactNode, groupDisabled = false): ReactNode {
  return Children.map(children, (child, index) => {
    if (!isValidElement<OptionProps>(child)) return null;
    if (child.type === Fragment) return options(child.props.children, groupDisabled);
    if (child.type === "optgroup") return <SelectGroup key={child.key ?? index}>
      <SelectLabel>{child.props.label}</SelectLabel>
      {options(child.props.children, groupDisabled || child.props.disabled)}
    </SelectGroup>;
    if (child.type !== "option") return null;
    const value = String(child.props.value ?? child.props.children ?? "");
    return <SelectItem key={child.key ?? index} value={`option:${value}`} disabled={groupDisabled || child.props.disabled}>
      {child.props.children}
    </SelectItem>;
  });
}

export function ScrollableSelect({ value, defaultValue, onValueChange, children, disabled, name, ...triggerProps }: Props) {
  return <Select
    value={value == null ? undefined : `option:${value}`}
    defaultValue={defaultValue == null ? undefined : `option:${defaultValue}`}
    onValueChange={next => onValueChange?.(next.slice("option:".length))}
    disabled={disabled}
  >
    <SelectTrigger {...triggerProps} disabled={disabled}><SelectValue /></SelectTrigger>
    <SelectContent position="popper" collisionPadding={12}>{options(children)}</SelectContent>
    {name && <input type="hidden" name={name} value={value ?? defaultValue ?? ""} disabled={disabled} />}
  </Select>;
}
