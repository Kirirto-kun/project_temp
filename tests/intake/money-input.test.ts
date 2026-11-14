import { expect,it } from 'vitest';
import { parseMoneyInput, moneyInputValue } from '@/onboarding/client/money-input';
it.each([['95,000',9500000],['$110,000.25',11000025],['0.01',1],['100000000',10000000000]])('parses explicit USD input %s into integer cents',(text,minor)=>{expect(parseMoneyInput(text)).toBe(minor);});
it.each(['95k','-100','1.001','95,0','Infinity','1e9','100000000.01'])('rejects ambiguous or unsupported amount %s',text=>{expect(()=>parseMoneyInput(text)).toThrow();});
it('lets the user clear an unknown amount and displays cents without rounding',()=>{expect(parseMoneyInput('')).toBeNull();expect(moneyInputValue(11000025)).toBe('110000.25');});
