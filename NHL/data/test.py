with open("bet_history.csv", "r") as f:
    lines = f.readlines()
    sum = 0
    dato = ""
    dagssum = 0
    values = {}
    for row in lines[1:]:
        row = row.split(",")
        rowDate = row[0]
        rowValue = row[9]
        rowValue = rowValue[:3]
        if rowDate != dato:
            print("DAGSSUM: ", dagssum)
            dagssum = 0
            dato = rowDate
            print("Date:", dato)
        delsum = float(row[13])
        if delsum == 0:
            continue
        if rowValue not in values:
            values[rowValue] = [delsum, 1]
        else:
            values[rowValue][0] += delsum
            values[rowValue][1] += 1
        print(delsum)
        dagssum += delsum
        sum += delsum
    
    print("Total:", sum)
    print("Values:", values)