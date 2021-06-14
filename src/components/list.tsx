/* eslint-disable react/require-default-props */
import React, {
  useCallback,
  useState,
  forwardRef,
  useEffect,
  useRef,
} from 'react';
import { FixedSizeList as List } from 'react-window';
import memoize from 'memoize-one';
import Preview from './preview';
import ChoiceButton from './button';
import { ChoiceButtonProps, ListProps } from '../types';

const createItemData = memoize(
  (choices, currentIndex, mouseEnabled, onIndexChange, onIndexSubmit) =>
    ({
      choices,
      currentIndex,
      mouseEnabled,
      onIndexChange,
      onIndexSubmit,
    } as ChoiceButtonProps['data'])
);

export default forwardRef<any, ListProps>(function ChoiceList(
  {
    listHeight,
    choices,
    onListHeightChanged,
    index,
    onIndexChange,
    onIndexSubmit,
  }: ListProps,
  ref
) {
  const listRef = useRef(null);
  const [mouseEnabled, setMouseEnabled] = useState(false);
  // TODO: In case items ever have dynamic height
  const [listItemHeight, setListItemHeight] = useState(64);

  const itemData = createItemData(
    choices,
    index,
    mouseEnabled,
    onIndexChange,
    onIndexSubmit
  );

  const onItemsRendered = useCallback(() => {
    const newListHeight = choices.length * listItemHeight;
    onListHeightChanged(newListHeight);
  }, [choices.length, listItemHeight, onListHeightChanged]);

  useEffect(() => {
    (listRef as any).current.scrollToItem(index);
  }, [choices, index]);

  return (
    <div
      ref={ref}
      className="flex flex-row w-full overflow-y-hidden border-t dark:border-white dark:border-opacity-5 border-black border-opacity-5 min-w-1/2"
      style={
        {
          WebkitAppRegion: 'no-drag',
          WebkitUserSelect: 'none',
          height: listHeight,
        } as any
      }
      // TODO: FIGURE OUT MOUSE INTERACTION 🐭
      onMouseEnter={() => setMouseEnabled(true)}
    >
      <List
        ref={listRef}
        height={listHeight}
        itemCount={choices?.length}
        itemSize={listItemHeight}
        width="100%"
        itemData={itemData}
        className="px-0 flex flex-col text-black dark:text-white overflow-y-scroll focus:border-none focus:outline-none outline-none flex-1 bg-opacity-20 min-w-1/2"
        onItemsRendered={onItemsRendered}
      >
        {ChoiceButton}
      </List>
      {choices?.[index]?.preview && (
        <Preview preview={choices?.[index]?.preview || ''} />
      )}
    </div>
  );
});