"use strict";
for (let i=0;i<10;  i); // i is ForStatement.update
for (let i=0;i<10; +i); // i is UnaryExpression.argument
for (let i=0;i<10;++i); // i is UpdateExpression.argument
// ignore variable defined in for statement
