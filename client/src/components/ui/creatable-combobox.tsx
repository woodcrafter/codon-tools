import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Option = {
  label: string;
  value: string;
};

type Props = {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowCustom?: boolean;
  className?: string;
  showControlsOnFocus?: boolean;
  hideControls?: boolean;
  clearOnTriggerClick?: boolean;
};

export function CreatableCombobox({
  options,
  value,
  onChange,
  placeholder = "请选择...",
  disabled = false,
  allowCustom = true,
  className,
  showControlsOnFocus = false,
  hideControls = false,
  clearOnTriggerClick = false,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [focused, setFocused] = React.useState(false);

  const selected = options.find(o => o.value === value);

  const normalizedQuery = query.trim();
  const canAddCustom =
    allowCustom &&
    normalizedQuery.length > 0 &&
    !options.some(o => o.value.toLowerCase() === normalizedQuery.toLowerCase());

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", !value && "text-muted-foreground", className)}
          disabled={disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onClick={() => {
            if (!disabled && clearOnTriggerClick) {
              if (value) onChange("");
              setOpen(true);
            }
          }}
        >
          <span className="truncate">{selected?.label ?? value ?? ""}</span>
          <span
            className={cn(
              "flex items-center gap-1",
              hideControls && "hidden",
              showControlsOnFocus &&
                !(open || focused) &&
                "w-0 overflow-hidden opacity-0 pointer-events-none"
            )}
          >
            {value ? (
              <span
                className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange("");
                }}
              >
                <X className="h-4 w-4" />
              </span>
            ) : null}
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="搜索或输入..." value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>未找到选项</CommandEmpty>
            <CommandGroup className="max-h-64 overflow-auto">
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === option.value ? "opacity-100" : "opacity-0")} />
                  <span>{option.label}</span>
                </CommandItem>
              ))}
              {canAddCustom ? (
                <CommandItem
                  key={`__add__${normalizedQuery}`}
                  value={normalizedQuery}
                  onSelect={() => {
                    onChange(normalizedQuery);
                    setOpen(false);
                  }}
                >
                  <span>添加 “{normalizedQuery}”</span>
                </CommandItem>
              ) : null}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
