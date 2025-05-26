export const arrayToSentence = (array: string[]): string => {
  if (array.length === 0) {
    return '';
  }

  if (array.length === 1) {
    return array[0];
  }

  const lastItem = array[array.length - 1];

  return array.slice(0, -1).join(', ') + ' and ' + lastItem;
};
