with open("bet_history.csv", "r") as f:
    lines = f.readlines()
    sum = 0
    dato = ""
    dagssum = 0
    for row in lines[1:]:
        row = row.split(",")
        rowDate = row[0]
        if rowDate != dato:
            print("DAGSSUM: ", dagssum)
            dagssum = 0
            dato = rowDate
            print("Date:", dato)
        delsum = float(row[13])
        print(delsum)
        dagssum += delsum
        sum += delsum
    print("Total:", sum)