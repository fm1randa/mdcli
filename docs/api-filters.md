# Meu Dinheiro API Filter Reference

This document describes the bitmask filters used in the `/v2/lancamentos` endpoint.

## Status Filter

The `status` parameter is a bitmask where each bit represents a status type:

| Bit | Value | Status       | API Value    |
|-----|-------|--------------|--------------|
| 0   | 1     | Pendentes    | `pendente`   |
| 1   | 2     | Confirmados  | `confirmado` |
| 2   | 4     | Conciliados  | `conciliado` |
| 3   | 8     | Agendados    | `agendado`   |

### Common Combinations

| Value | Binary | Description                              |
|-------|--------|------------------------------------------|
| 0     | 0000   | None (returns 0 results)                 |
| 1     | 0001   | Pendentes only                           |
| 2     | 0010   | Confirmados only                         |
| 3     | 0011   | Pendentes + Confirmados                  |
| 4     | 0100   | Conciliados only                         |
| 5     | 0101   | Pendentes + Conciliados                  |
| 6     | 0110   | Confirmados + Conciliados                |
| 7     | 0111   | Pendentes + Confirmados + Conciliados    |
| 8     | 1000   | Agendados only                           |
| 9     | 1001   | Pendentes + Agendados                    |
| 10    | 1010   | Confirmados + Agendados                  |
| 11    | 1011   | Pendentes + Confirmados + Agendados      |
| 12    | 1100   | Conciliados + Agendados                  |
| 13    | 1101   | Pendentes + Conciliados + Agendados      |
| 14    | 1110   | Confirmados + Conciliados + Agendados    |
| 15    | 1111   | All statuses                             |

## Type Filter (tipoLancamento)

The `tipoLancamento` parameter is a bitmask where each bit represents an entry type:

| Bit | Value | Type            | API Value | Description              |
|-----|-------|-----------------|-----------|--------------------------|
| 0   | 1     | Despesas        | `d`       | Expenses (negative)      |
| 1   | 2     | Receitas        | `r`       | Income (positive)        |
| 2   | 4     | Transf. saída   | `t`       | Transfer out (negative)  |
| 3   | 8     | Transf. entrada | `t`       | Transfer in (positive)   |

### Common Combinations

| Value | Binary | Description                                    |
|-------|--------|------------------------------------------------|
| 0     | 0000   | None (but API returns all - see note)          |
| 1     | 0001   | Despesas only                                  |
| 2     | 0010   | Receitas only                                  |
| 3     | 0011   | Despesas + Receitas                            |
| 4     | 0100   | Transf. saída only                             |
| 5     | 0101   | Despesas + Transf. saída                       |
| 6     | 0110   | Receitas + Transf. saída                       |
| 7     | 0111   | Despesas + Receitas + Transf. saída            |
| 8     | 1000   | Transf. entrada only                           |
| 9     | 1001   | Despesas + Transf. entrada                     |
| 10    | 1010   | Receitas + Transf. entrada                     |
| 11    | 1011   | Despesas + Receitas + Transf. entrada          |
| 12    | 1100   | Transf. saída + Transf. entrada                |
| 13    | 1101   | Despesas + Transf. saída + Transf. entrada     |
| 14    | 1110   | Receitas + Transf. saída + Transf. entrada     |
| 15    | 1111   | All types                                      |

> **Note:** When `tipoLancamento=0`, the API appears to return entries regardless of type filter.

## Usage in CLI

```bash
# Filter by status (names or bitmask)
mdcli entries list -a 201 -s pending              # status=1
mdcli entries list -a 201 -s reconciled           # status=4
mdcli entries list -a 201 -s pending,reconciled   # status=5
mdcli entries list -a 201 -s 5                    # status=5 (bitmask)

# Filter by type (names or bitmask)
mdcli entries list -a 201 -T expense              # tipoLancamento=1
mdcli entries list -a 201 -T income               # tipoLancamento=2
mdcli entries list -a 201 -T transfer-out         # tipoLancamento=4
mdcli entries list -a 201 -T expense,income       # tipoLancamento=3

# Filter by category
mdcli entries list -a 201 -c 11                  # Single category
mdcli entries list -a 201 -c 11,20               # Multiple categories

# Filter by tag
mdcli entries list -a 201 -g 501                 # Single tag
mdcli entries list -a 201 -g 501,502             # Multiple tags

# Search by keywords
mdcli entries list -a 201 -k "aluguel"
mdcli entries list -a 201 -k "internet"

# Filter by value
mdcli entries list -a 201 -v 100

# Combine filters
mdcli entries list -a 201 -s pending -T expense -k "reserva"
```

## Calculating Bitmask Values

To combine multiple options, add their values together:

```
Pendentes (1) + Conciliados (4) = 5
Despesas (1) + Receitas (2) + Transf. saída (4) = 7
```

Or use bitwise OR:

```typescript
const status = StatusFlags.Pendentes | StatusFlags.Conciliados; // 5
const tipo = TypeFlags.Despesas | TypeFlags.Receitas; // 3
```
